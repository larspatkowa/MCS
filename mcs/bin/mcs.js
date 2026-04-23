#!/usr/bin/env node
/**
 * Global CLI: runs the MCS dev server (Vite) from the installed package root.
 * Usage: `mcs` or `mcs -- --port 7000` (extra args forwarded to `vite dev`).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const localVite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const wsVite = path.join(root, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const viteBin = existsSync(localVite) ? localVite : wsVite;

if (!existsSync(viteBin)) {
	console.error('mcs: could not find vite. Run npm install in the mcs package directory.');
	process.exit(1);
}

const extra = process.argv.slice(2);
const child = spawn(process.execPath, [viteBin, 'dev', ...extra], {
	cwd: root,
	stdio: 'inherit',
	env: { ...process.env }
});

child.on('exit', (code, signal) => {
	if (signal) process.kill(process.pid, signal);
	process.exit(code ?? 1);
});
