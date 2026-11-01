#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const runtimePackage = require.resolve("mcs-platform/package.json");
const runtimeBin = join(dirname(runtimePackage), "bin", "mcs.js");
const args = process.argv.slice(2);
const asksForHelp = args.includes("--help") || args.includes("-h");
const hasInstallChoice =
  args.includes("--install") || args.includes("--no-install");
const forwarded = ["create", ...args];
if (!asksForHelp && !hasInstallChoice) forwarded.push("--install");

const child = spawn(process.execPath, [runtimeBin, ...forwarded], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`create-mcs: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
