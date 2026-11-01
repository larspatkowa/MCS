#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { evaluateChannel } from '../examples/flight-system/telemetry-model.mjs';
import {
	assertProjectCanOpen,
	initializeProjectDirectory,
	inspectProjectDirectory,
	upgradeProjectDirectory
} from '../project-format/project.js';
import { backupProjectDirectory, restoreProjectBackup } from '../project-format/backup.js';
import { DATABASE_SCHEMA_VERSION, PROJECT_FORMAT_VERSION } from '../project-format/schema.js';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const version = packageJson.version;

function printHelp() {
	console.log(`MCS ${version}

	Usage:
	  mcs create [directory] [--name <name>] [--template <name>] [--install]
	  mcs open [directory] [--port <port>] [--host <host>] [--open]
	  mcs doctor [directory]
	  mcs verify [directory]  (alias for doctor)
	  mcs backup [project-directory] [backup-directory]
	  mcs restore <backup-directory> <new-project-directory>
	  mcs upgrade [directory]
	  mcs update [directory]  (compatibility alias for upgrade)
	  mcs mcp [--url <server>] [--token <project-token>]


Examples:
  mcs create my-project
  mcs create my-flight-project --template flight-system
  mcs open my-project --open
  mcs doctor my-project
  mcs backup my-project
  mcs restore .mcs-backups/project-2026-09-25 my-project-restored
  mcs upgrade my-project
  mcs mcp --url http://127.0.0.1:5173   (MCP over stdio for AI agents)
`);
}

function fail(message) {
	console.error(`mcs: ${message}`);
	process.exitCode = 1;
}

function readOption(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
	args.splice(index, 2);
	return value;
}

function readFlag(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return false;
	args.splice(index, 1);
	return true;
}

function readDirectory(args) {
	const positional = args.filter((value) => !value.startsWith('--'));
	if (positional.length > 1) throw new Error(`unexpected argument: ${positional[1]}`);
	return path.resolve(positional[0] ?? '.');
}

function ensureNoUnknownOptions(args) {
	const unknown = args.find((value) => value.startsWith('--'));
	if (unknown) throw new Error(`unknown option: ${unknown}`);
}

function defaultName(directory) {
	return path.basename(directory) || 'MCS Project';
}

function packageName(directory) {
	return (
		path
			.basename(directory)
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^[._-]+|[._-]+$/g, '') || 'mcs-project'
	);
}

function flightSystemReadme(projectName, runtimePackage) {
	return `# ${projectName}

This project is an offline flight-system workspace starter. Its initial plotted values are a small, deterministic simulated history so the displays are useful before a telemetry source is connected.

All demo values are simulated. The optional telemetry simulator sends telemetry to the local MCS ingest endpoint only; it never sends commands and does not start automatically.

## Start MCS and the optional simulator

Install the pinned runtime once:

\`\`\`bash
npm install
npm run doctor
\`\`\`

In Terminal 1, open this project:

\`\`\`bash
npm run dev
\`\`\`

In Terminal 2, start the optional simulator:

\`\`\`bash
npm run demo:telemetry
\`\`\`

The simulator posts versioned telemetry to \`http://127.0.0.1:5173/api/ingest/v2\` once per second. Press Ctrl+C to stop it. Set \`MCS_INGEST_URL\` if MCS is listening at a different local URL.

Runtime updates and project-data upgrades are separate. \`npm run update\` runs \`npm update ${runtimePackage}\` first, then \`mcs upgrade .\` with a backup before any project migration.
`;
}

function seedFlightSystem(projectPath, template, projectId) {
	const database = new Database(path.join(projectPath, 'mcs.db'));
	const now = new Date();
	const nowIso = now.toISOString();
	const nowSeconds = now.getTime() / 1000;
	try {
		const insertObject = database.prepare(
			`INSERT INTO objects (id,type,parent_id,sort_order,name,notes,props,created_at,updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?)`
		);
		const objectIds = new Map();
		const insertTree = (spec, parentId, sortOrder = 0) => {
			const id = spec.id;
			if (typeof id !== 'string' || objectIds.has(id))
				throw new Error('invalid template object id');
			objectIds.set(id, id);
			insertObject.run(
				id,
				spec.type,
				parentId,
				sortOrder,
				spec.name,
				spec.notes ?? '',
				JSON.stringify(spec.props ?? {}),
				nowIso,
				nowIso
			);
			for (const [index, child] of (spec.children ?? []).entries()) insertTree(child, id, index);
		};
		const insertSeed = database.transaction(() => {
			for (const [index, object] of template.objects.entries()) {
				insertTree(object, projectId, index);
			}
			const insertStream = database.prepare(
				'INSERT INTO streams (id,name,metadata,created_at) VALUES (?,?,?,?)'
			);
			const insertSource = database.prepare(
				`INSERT INTO telemetry_sources (id,name,time_system,timestamp_unit,expected_period_ms,created_at,updated_at,last_received_at,last_event_at,last_sequence)
				 VALUES (?,?,?,?,?,?,?,?,?,?)`
			);
			const insertHistory = database.prepare(
				`INSERT INTO telemetry_history
				 (stream_id,source_id,source_timestamp,source_timestamp_raw,source_timestamp_is_string,source_unit,source_time_system,event_ts,received_at,source_sequence,idempotency_key,payload,quality_json)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
			);
			const source = template.source;
			insertSource.run(
				source.id,
				source.name,
				source.timeSystem,
				source.timestampUnit,
				source.expectedPeriodMs,
				nowIso,
				nowIso,
				nowSeconds,
				nowSeconds,
				Math.floor(nowSeconds)
			);
			for (const channel of template.channels) {
				insertStream.run(channel.id, channel.name, JSON.stringify(channel.metadata), nowIso);
				for (let index = 0; index < template.history.count; index++) {
					const timestamp =
						nowSeconds - (template.history.count - 1 - index) * template.history.periodSeconds;
					const value = evaluateChannel(channel, timestamp);
					const sequence = Math.floor(timestamp);
					insertHistory.run(
						channel.id,
						source.id,
						timestamp,
						String(timestamp),
						0,
						source.timestampUnit,
						source.timeSystem,
						timestamp,
						nowSeconds,
						sequence,
						`seed-${channel.id}-${sequence}`,
						JSON.stringify({ value: Number(value.toFixed(4)) }),
						JSON.stringify({ clock: 'good', source: 'template-seed' })
					);
				}
				database
					.prepare(
						`INSERT INTO source_stream_sequences (source_id,stream_id,max_sequence) VALUES (?,?,?)`
					)
					.run(source.id, channel.id, Math.floor(nowSeconds));
			}
		});
		insertSeed();
	} finally {
		database.close();
	}
}

function createCommand(rawArgs) {
	const args = [...rawArgs];
	if (args.includes('--help') || args.includes('-h')) {
		printHelp();
		return;
	}
	const name = readOption(args, '--name');
	const templateName = readOption(args, '--template') ?? 'blank';
	const install = readFlag(args, '--install');
	const noInstall = readFlag(args, '--no-install');
	if (install && noInstall) throw new Error('use either --install or --no-install, not both');
	ensureNoUnknownOptions(args);
	const directory = readDirectory(args);
	let template;
	if (templateName !== 'blank' && templateName !== 'flight-system') {
		throw new Error(
			`unknown template "${templateName}"; available templates: blank, flight-system`
		);
	}
	if (templateName === 'flight-system') {
		const templatePath = path.join(
			packageRoot,
			'project-format',
			'templates',
			'flight-system',
			'seed.json'
		);
		if (!existsSync(templatePath)) throw new Error(`template files not found: ${templatePath}`);
		template = JSON.parse(readFileSync(templatePath, 'utf8'));
	}
	if (existsSync(directory)) {
		const entries = readdirSync(directory).filter((entry) => entry !== '.DS_Store');
		if (entries.length > 0) {
			throw new Error(`directory is not empty: ${directory}`);
		}
	}

	const projectName = (name ?? defaultName(directory)).trim();
	if (!projectName) throw new Error('project name cannot be empty');
	const manifest = initializeProjectDirectory(directory, {
		name: projectName,
		...(template?.defaultSelection
			? { settings: { defaultObjectId: template.defaultSelection } }
			: {}),
		mcsVersion: version
	});
	if (template) seedFlightSystem(directory, template, manifest.id);

	writeFileSync(path.join(directory, '.gitignore'), '.mcs/runtime/\nmcs.db-shm\nmcs.db-wal\n', {
		flag: 'wx'
	});
	const runtimeSpec = process.env.MCS_RUNTIME_SPEC ?? `^${version}`;
	writeFileSync(
		path.join(directory, 'package.json'),
		`${JSON.stringify(
			{
				name: packageName(directory),
				private: true,
				version: '0.0.0',
				type: 'module',
				engines: { node: '>=22' },
				scripts: {
					dev: 'mcs open .',
					start: 'mcs open . --port 3000',
					doctor: 'mcs doctor .',
					...(template
						? { 'demo:telemetry': 'node examples/flight-system/telemetry-simulator.mjs' }
						: {}),
					update: `npm update ${packageJson.name} && mcs upgrade .`
				},
				dependencies: { [packageJson.name]: runtimeSpec }
			},
			null,
			2
		)}\n`,
		{ flag: 'wx' }
	);
	writeFileSync(
		path.join(directory, 'README.md'),
		template
			? flightSystemReadme(projectName, packageJson.name)
			: `# ${projectName}\n\nThis directory contains project data and a pinned MCS runtime dependency. Install dependencies and open the workspace:\n\n\`\`\`bash\nnpm install\nnpm run doctor\nnpm run dev -- --open\n\`\`\`\n\nRuntime updates and project-data upgrades are separate. \`npm run update\` runs \`npm update ${packageJson.name}\` first, then \`mcs upgrade .\` with a backup before any project migration. The compatibility alias \`mcs update .\` is also preserved.\n`,
		{ flag: 'wx' }
	);
	if (template) {
		const simulatorSource = path.join(
			packageRoot,
			'examples',
			'flight-system',
			'telemetry-simulator.mjs'
		);
		const modelSource = path.join(packageRoot, 'examples', 'flight-system', 'telemetry-model.mjs');
		const simulatorDirectory = path.join(directory, 'examples', 'flight-system');
		mkdirSync(simulatorDirectory, { recursive: true });
		copyFileSync(simulatorSource, path.join(simulatorDirectory, 'telemetry-simulator.mjs'));
		copyFileSync(modelSource, path.join(simulatorDirectory, 'telemetry-model.mjs'));
		copyFileSync(
			path.join(packageRoot, 'project-format', 'templates', 'flight-system', 'seed.json'),
			path.join(simulatorDirectory, 'seed.json')
		);
	}

	if (install && !noInstall) {
		console.log('Installing dependencies...');
		const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
		const result = spawnSync(npm, ['install'], { cwd: directory, stdio: 'inherit' });
		if (result.error) throw result.error;
		if (result.status !== 0) {
			throw new Error(`npm install failed with exit code ${result.status ?? 'unknown'}`);
		}
	}

	console.log(`Created ${manifest.name}`);
	console.log(`Project: ${directory}`);
	const relativeDirectory = path.relative(process.cwd(), directory);
	const displayDirectory =
		relativeDirectory && !relativeDirectory.startsWith('..') ? relativeDirectory : directory;
	const nextCommand =
		install && !noInstall ? 'npm run dev -- --open' : 'npm install\n  npm run dev -- --open';
	console.log(`\nNext:\n  cd ${JSON.stringify(displayDirectory || '.')}\n  ${nextCommand}`);
}

function spawnAndForward(command, args, options) {
	const child = spawn(command, args, { stdio: 'inherit', ...options });
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => child.kill(signal));
	}
	child.on('error', (error) => fail(error.message));
	child.on('exit', (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}
		process.exitCode = code ?? 1;
	});
	return child;
}

function isLoopbackHost(host) {
	return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function openBrowser(url) {
	let command;
	let args;
	if (process.platform === 'darwin') {
		command = 'open';
		args = [url];
	} else if (process.platform === 'win32') {
		command = 'cmd';
		args = ['/c', 'start', '', url];
	} else {
		command = 'xdg-open';
		args = [url];
	}
	const child = spawn(command, args, { detached: true, stdio: 'ignore' });
	child.on('error', (error) => console.warn(`Could not open a browser: ${error.message}`));
	child.unref();
}

async function openBrowserWhenReady(healthUrl, projectUrl) {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(healthUrl);
			if (response.ok) {
				openBrowser(projectUrl);
				return;
			}
		} catch {
			// The server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 150));
	}
	console.warn(`Server did not become ready at ${healthUrl} within 15 seconds`);
}

function openCommand(rawArgs) {
	const args = [...rawArgs];
	if (args.includes('--help') || args.includes('-h')) {
		printHelp();
		return;
	}
	const port = readOption(args, '--port') ?? '5173';
	const host = readOption(args, '--host') ?? '127.0.0.1';
	const shouldOpen = readFlag(args, '--open');
	const allowRemote = readFlag(args, '--allow-remote');
	const portNumber = Number(port);
	if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
		throw new Error(`invalid port: ${port}`);
	}
	if (!host || /\s/.test(host)) throw new Error(`invalid host: ${host}`);
	if (!isLoopbackHost(host) && !allowRemote) {
		throw new Error('non-loopback hosts require --allow-remote and authenticated access');
	}
	if (!isLoopbackHost(host)) {
		if (process.env.MCS_AUTH_REQUIRED !== '1') {
			throw new Error('remote access requires MCS_AUTH_REQUIRED=1');
		}
		if (!process.env.MCS_BOOTSTRAP_TOKEN || process.env.MCS_BOOTSTRAP_TOKEN.length < 24) {
			throw new Error('remote access requires MCS_BOOTSTRAP_TOKEN with at least 24 characters');
		}
	}
	ensureNoUnknownOptions(args);
	const directory = readDirectory(args);
	const inspection = assertProjectCanOpen(directory);
	const manifest = inspection.manifest;

	const serverEntry = path.join(packageRoot, 'build', 'index.js');
	if (!existsSync(serverEntry)) {
		throw new Error('production build not found; run npm run build in the MCS package');
	}
	const runtimeDirectory = path.resolve(
		process.env.MCS_CONFIG_DIR ?? path.join(directory, '.mcs', 'runtime')
	);
	mkdirSync(runtimeDirectory, { recursive: true });
	const configPath = path.join(runtimeDirectory, 'config.json');
	let previousConfig = {};
	if (existsSync(configPath)) {
		try {
			const parsedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
			if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
				previousConfig = parsedConfig;
			}
		} catch {
			// Match the runtime loader: an unreadable config starts from defaults.
		}
	}
	const recentProjectPaths = Array.isArray(previousConfig.recentProjectPaths)
		? previousConfig.recentProjectPaths
				.filter((item) => typeof item === 'string')
				.map((item) => path.resolve(item))
		: [];
	writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				...previousConfig,
				recentProjectPaths: [
					directory,
					...recentProjectPaths.filter((item) => item !== directory)
				].slice(0, 20),
				defaultProjectPath: directory
			},
			null,
			2
		)}\n`,
		'utf8'
	);

	const browserHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
	const baseUrl = `http://${browserHost}:${port}`;
	const defaultObjectId = manifest.settings?.defaultObjectId;
	const projectUrl = `${baseUrl}/project/${manifest.id}${typeof defaultObjectId === 'string' ? `?object=${encodeURIComponent(defaultObjectId)}` : ''}`;
	console.log(`Opening ${manifest.name}`);
	console.log(projectUrl);
	if (!isLoopbackHost(host)) {
		console.warn(
			'Remote access is enabled with account authentication. Put MCS behind HTTPS before exposing it to users.'
		);
	}
	spawnAndForward(process.execPath, [serverEntry], {
		cwd: packageRoot,
		env: {
			...process.env,
			NODE_ENV: 'production',
			MCS_VERSION: version,
			HOST: host,
			PORT: port,
			MCS_CONFIG_DIR: runtimeDirectory,
			MCS_PROJECTS_DIR: path.dirname(directory)
		}
	});
	if (shouldOpen) void openBrowserWhenReady(`${baseUrl}/api/health`, projectUrl);
}

function doctorCommand(rawArgs) {
	const args = [...rawArgs];
	ensureNoUnknownOptions(args);
	const directory = readDirectory(args);
	const results = [];
	const check = (label, ok, detail) => results.push({ label, ok, detail });
	const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
	const inspection = inspectProjectDirectory(directory, { fullIntegrity: true });
	check('Node.js', nodeMajor >= 22, `${process.version}; requires Node.js >=22`);
	check('MCS runtime', true, `v${version} (${packageRoot})`);
	check(
		'Project manifest',
		inspection.manifestValid,
		inspection.manifestValid ? path.join(directory, 'project.json') : inspection.manifestError
	);
	const formatDetail =
		inspection.projectFormatVersion === null
			? `unknown; supported through v${PROJECT_FORMAT_VERSION}`
			: `v${inspection.projectFormatVersion}, supported through v${PROJECT_FORMAT_VERSION}`;
	check(
		'Project format version',
		inspection.metadataValid && inspection.projectFormatVersion === PROJECT_FORMAT_VERSION,
		formatDetail
	);
	const databaseDetail =
		inspection.databaseSchemaVersion === null
			? `unknown; supported through v${DATABASE_SCHEMA_VERSION}`
			: `v${inspection.databaseSchemaVersion}, supported through v${DATABASE_SCHEMA_VERSION}`;
	check(
		'Database schema version',
		inspection.databaseSchemaVersion === DATABASE_SCHEMA_VERSION,
		databaseDetail
	);
	check(
		'Project metadata/schema match',
		inspection.metadataMatchesDatabase,
		inspection.metadataMatchesDatabase
			? `v${inspection.databaseSchemaVersion}`
			: `metadata v${inspection.metadataDatabaseSchemaVersion ?? 'unknown'}, database v${inspection.databaseSchemaVersion ?? 'unknown'}`
	);
	check(
		'SQLite integrity',
		inspection.databaseIntegrity === 'ok',
		inspection.databaseIntegrity ?? inspection.databaseError ?? 'unavailable'
	);
	check(
		'Project root',
		inspection.projectRootPresent,
		inspection.projectRootPresent ? 'present' : 'missing'
	);
	check(
		'Needs upgrade',
		!inspection.needsUpgrade && !inspection.forwardIncompatible,
		inspection.forwardIncompatible
			? 'no; project requires a newer MCS version'
			: inspection.needsUpgrade
				? `yes; run mcs upgrade ${directory}`
				: 'no'
	);

	for (const result of results) {
		console.log(`${result.ok ? 'ok  ' : 'fail'} ${result.label}: ${result.detail}`);
	}
	if (results.some((result) => !result.ok)) process.exitCode = 1;
}

function upgradeCommand(rawArgs) {
	const args = [...rawArgs];
	if (args.includes('--help') || args.includes('-h')) {
		console.log('Usage: mcs upgrade [directory]');
		return;
	}
	ensureNoUnknownOptions(args);
	const directory = readDirectory(args);
	const result = upgradeProjectDirectory(directory, { mcsVersion: version });
	if (!result.changed) {
		console.log(
			`Project format and database schema are current (format v${result.toVersion}, schema v${result.toDatabaseVersion})`
		);
		return;
	}
	console.log(
		`Upgraded project format v${result.fromVersion} to v${result.toVersion}; database schema v${result.fromDatabaseVersion} to v${result.toDatabaseVersion}`
	);
	console.log(`Backup: ${result.backupPath}`);
	if (result.metadataBackupPath) console.log(`Metadata backup: ${result.metadataBackupPath}`);
	if (result.manifestBackupPath) console.log(`Manifest backup: ${result.manifestBackupPath}`);
}

async function backupCommand(rawArgs) {
	const args = [...rawArgs];
	if (args.includes('--help') || args.includes('-h')) {
		console.log('Usage: mcs backup [project-directory] [backup-directory]');
		return;
	}
	ensureNoUnknownOptions(args);
	const positional = args.filter((value) => !value.startsWith('--'));
	if (positional.length > 2) throw new Error(`unexpected argument: ${positional[2]}`);
	const source = path.resolve(positional[0] ?? '.');
	let destination = positional[1] ? path.resolve(positional[1]) : undefined;
	if (!destination) {
		const inspection = inspectProjectDirectory(source);
		if (!inspection.manifestValid || !inspection.manifest)
			throw new Error(inspection.manifestError ?? 'invalid project manifest');
		const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
		destination = path.join(
			path.dirname(source),
			'.mcs-backups',
			`${inspection.manifest.id}-${stamp}`
		);
	}
	const result = await backupProjectDirectory(source, destination);
	console.log(`Project backup created: ${result.path}`);
	console.log(`Project: ${result.projectId}; files: ${result.files}`);
}

async function restoreCommand(rawArgs) {
	const args = [...rawArgs];
	if (args.includes('--help') || args.includes('-h')) {
		console.log('Usage: mcs restore <backup-directory> <new-project-directory>');
		return;
	}
	ensureNoUnknownOptions(args);
	const positional = args.filter((value) => !value.startsWith('--'));
	if (positional.length !== 2)
		throw new Error('mcs restore requires a backup directory and a new project directory');
	const result = await restoreProjectBackup(
		path.resolve(positional[0]),
		path.resolve(positional[1])
	);
	console.log(`Project restored: ${result.path}`);
	console.log(`Project: ${result.projectId}`);
	console.log(
		`Next: mcs doctor ${JSON.stringify(result.path)} && mcs open ${JSON.stringify(result.path)} --open`
	);
}

/**
 * Bridge MCP stdio to a running server's /api/mcp endpoint. Agents that only
 * speak stdio (most desktop clients) launch this; each JSON-RPC line is
 * forwarded and the reply written back as one line.
 */
async function mcpCommand(rawArgs) {
	const args = [...rawArgs];
	const base = (
		readOption(args, '--url') ??
		process.env.MCS_URL ??
		'http://127.0.0.1:5173'
	).replace(/\/$/, '');
	const token = readOption(args, '--token') ?? process.env.MCS_TOKEN;
	ensureNoUnknownOptions(args);
	const endpoint = `${base}/api/mcp`;
	const headers = { 'content-type': 'application/json', accept: 'application/json' };
	if (token) headers.authorization = `Bearer ${token}`;
	const { createInterface } = await import('node:readline');
	const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
	let queue = Promise.resolve();
	for await (const line of lines) {
		if (!line.trim()) continue;
		queue = queue.then(async () => {
			let id = null;
			try {
				id = JSON.parse(line).id ?? null;
			} catch {
				// The server answers malformed JSON with a parse error.
			}
			try {
				const response = await fetch(endpoint, { method: 'POST', headers, body: line });
				if (response.status === 202) return;
				const text = await response.text();
				let body = null;
				try {
					body = JSON.parse(text);
				} catch {
					// Not JSON; reported below.
				}
				// Auth and other HTTP errors are plain {error} bodies, not JSON-RPC.
				if (Array.isArray(body) || body?.jsonrpc === '2.0') {
					process.stdout.write(`${JSON.stringify(body)}\n`);
				} else {
					throw new Error(body?.error ?? `HTTP ${response.status}`);
				}
			} catch (error) {
				if (id === null) return;
				const message = `MCS server at ${base} is unreachable or refused the request: ${error instanceof Error ? error.message : String(error)}`;
				process.stdout.write(
					`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } })}\n`
				);
			}
		});
	}
	await queue;
}

const [command = 'help', ...args] = process.argv.slice(2);

try {
	if (command === '--help' || command === '-h' || command === 'help') printHelp();
	else if (command === '--version' || command === '-v') console.log(version);
	else if (command === 'create') createCommand(args);
	else if (command === 'open' || command === 'serve' || command === 'start') openCommand(args);
	else if (command === 'doctor' || command === 'verify') doctorCommand(args);
	else if (command === 'backup') await backupCommand(args);
	else if (command === 'restore') await restoreCommand(args);
	else if (command === 'upgrade' || command === 'update') upgradeCommand(args);
	else if (command === 'mcp') await mcpCommand(args);
	else throw new Error(`unknown command "${command}"; run mcs --help`);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
