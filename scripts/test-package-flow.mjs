import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const binExtension = process.platform === "win32" ? ".cmd" : "";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return (result.stdout ?? "").trim();
}

function assertDoctorReport(output) {
  for (const label of [
    "Node.js",
    "MCS runtime",
    "Project format version",
    "Database schema version",
    "Project manifest",
    "SQLite integrity",
    "Project root",
    "Needs upgrade",
  ]) {
    if (!output.includes(label)) {
      throw new Error(`Doctor report did not include ${label}:\n${output}`);
    }
  }
}

function pack(workspace, destination) {
  const output = run(npm, [
    "pack",
    "--workspace",
    workspace,
    "--pack-destination",
    destination,
    "--silent",
  ]);
  const filename = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast((line) => line.endsWith(".tgz"));
  if (!filename)
    throw new Error(`npm pack did not return a tarball name:\n${output}`);
  return join(destination, filename);
}

async function availablePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitFor(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw lastError ?? new Error(`${url} did not become ready`);
}

async function waitForFile(path, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return readFileSync(path, "utf8").trim();
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`${path} was not created within ${timeoutMs}ms`);
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const testRoot = mkdtempSync(join(tmpdir(), "mcs-package-flow-"));
const artifacts = join(testRoot, "artifacts");
const bootstrap = join(testRoot, "bootstrap");
const project = join(bootstrap, "mcs-project");
mkdirSync(artifacts, { recursive: true });
mkdirSync(bootstrap, { recursive: true });

let server;
try {
  console.log("Packing release artifacts...");
  const runtimeTarball = pack("mcs-platform", artifacts);
  const createTarball = pack("create-mcs", artifacts);
  if (!existsSync(runtimeTarball) || !existsSync(createTarball)) {
    throw new Error("Expected release tarballs were not created");
  }

  writeFileSync(
    join(bootstrap, "package.json"),
    `${JSON.stringify({ name: "mcs-package-flow-bootstrap", private: true }, null, 2)}\n`,
  );
  run(
    npm,
    ["install", runtimeTarball, createTarball, "--no-audit", "--no-fund"],
    {
      cwd: bootstrap,
    },
  );

  console.log("Creating and installing a blank project...");
  const createBin = join(
    bootstrap,
    "node_modules",
    ".bin",
    `create-mcs${binExtension}`,
  );
  run(createBin, ["mcs-project"], {
    cwd: bootstrap,
    env: { MCS_RUNTIME_SPEC: runtimeTarball },
    stdio: "inherit",
  });
  const initialDoctor = run(npm, ["run", "doctor"], { cwd: project });
  assertDoctorReport(initialDoctor);
  console.log(initialDoctor);

  const port = await availablePort();
  const mcsBin = join(project, "node_modules", ".bin", `mcs${binExtension}`);
  const remoteGuard = spawnSync(
    mcsBin,
    ["open", ".", "--host", "0.0.0.0", "--port", String(port)],
    { cwd: project, encoding: "utf8" },
  );
  if (
    remoteGuard.status === 0 ||
    !`${remoteGuard.stdout ?? ""}${remoteGuard.stderr ?? ""}`.includes(
      "non-loopback hosts require --allow-remote and authenticated access",
    )
  ) {
    throw new Error(
      "The packaged CLI did not guard accidental remote exposure",
    );
  }
  server = spawn(
    mcsBin,
    ["open", ".", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: project,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitFor(`${baseUrl}/api/health`);
  const manifest = JSON.parse(
    readFileSync(join(project, "project.json"), "utf8"),
  );
  const runtimeConfig = JSON.parse(
    readFileSync(join(project, ".mcs", "runtime", "config.json"), "utf8"),
  );
  if (runtimeConfig.defaultProjectPath !== realpathSync(project)) {
    throw new Error(
      `Packaged CLI did not point the runtime config at the opened project: ${JSON.stringify(runtimeConfig)}`,
    );
  }
  const rootRedirect = await fetch(`${baseUrl}/`, { redirect: "manual" });
  if (
    rootRedirect.status !== 307 ||
    rootRedirect.headers.get("location") !== `/project/${manifest.id}`
  ) {
    throw new Error(
      `CLI-opened root did not redirect directly to the project: ${rootRedirect.status} ${rootRedirect.headers.get("location")}`,
    );
  }

  const browserShimDirectory = join(testRoot, "browser-bin");
  const browserCapturePath = join(testRoot, "opened-url.txt");
  mkdirSync(browserShimDirectory, { recursive: true });
  const browserShimPath = join(browserShimDirectory, "open");
  writeFileSync(
    browserShimPath,
    '#!/bin/sh\nprintf "%s\\n" "$1" > "$MCS_BROWSER_CAPTURE"\n',
  );
  chmodSync(browserShimPath, 0o755);
  const openPort = await availablePort();
  const browserLaunch = spawn(
    mcsBin,
    ["open", ".", "--host", "127.0.0.1", "--port", String(openPort), "--open"],
    {
      cwd: project,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        PATH: `${browserShimDirectory}:${process.env.PATH ?? ""}`,
        MCS_BROWSER_CAPTURE: browserCapturePath,
      },
    },
  );
  await waitFor(`http://127.0.0.1:${openPort}/api/health`);
  const openedUrl = await waitForFile(browserCapturePath);
  if (openedUrl !== `http://127.0.0.1:${openPort}/project/${manifest.id}`) {
    await stopProcess(browserLaunch);
    throw new Error(`--open launched the wrong workspace URL: ${openedUrl}`);
  }
  await stopProcess(browserLaunch);

  const projectPage = await fetch(`${baseUrl}/project/${manifest.id}`);
  if (!projectPage.ok || !(await projectPage.text()).includes("MCS")) {
    throw new Error("The packaged project page did not render");
  }

  const ingest = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: manifest.id,
      streamId: "sensor:raw",
      timestamp: 1000,
      values: { value: 4242 },
    }),
  });
  if (!ingest.ok)
    throw new Error(
      `Packaged ingest failed: ${ingest.status} ${await ingest.text()}`,
    );
  const samples = await fetch(
    `${baseUrl}/api/projects/${manifest.id}/streams/sensor%3Araw/samples`,
  );
  const payload = await samples.json();
  if (!samples.ok || payload.data?.[0]?.value !== 4242) {
    throw new Error(
      `Packaged sample round-trip failed: ${JSON.stringify(payload)}`,
    );
  }

  await stopProcess(server);
  server = undefined;
  const finalDoctor = run(npm, ["run", "doctor"], { cwd: project });
  assertDoctorReport(finalDoctor);
  console.log(finalDoctor);
  console.log(
    "Package flow passed: create, install, open, render, ingest, read, stop, doctor.",
  );
} catch (error) {
  if (server) await stopProcess(server);
  throw error;
} finally {
  if (process.env.MCS_KEEP_PACKAGE_TEST === "1") {
    console.log(`Kept package test directory: ${testRoot}`);
  } else {
    rmSync(testRoot, { recursive: true, force: true });
  }
}
