import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const buildRoot = resolve(packageRoot, 'build');
let removed = 0;

async function removeSourceMaps(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (!path.startsWith(`${buildRoot}/`)) {
			throw new Error(`Refusing to inspect a path outside the generated build: ${path}`);
		}
		if (entry.isDirectory()) {
			await removeSourceMaps(path);
		} else if (entry.isFile() && entry.name.endsWith('.map')) {
			await rm(path);
			removed += 1;
		}
	}
}

await removeSourceMaps(buildRoot);
console.log(`Removed ${removed} generated source maps from the package build.`);
