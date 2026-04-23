import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function safeRm(dirPath: string) {
	try {
		rmSync(dirPath, { recursive: true, force: true });
	} catch {
		// best-effort
	}
}

export default async function globalTeardown() {
	// Project folders are only delete-able by the API if they're under data/projects,
	// but tests can still leave folders behind if the process is interrupted.
	// This teardown is a last-resort cleanup for known e2e prefixes.
	const projectsBase = join(process.cwd(), 'data', 'projects');
	if (!existsSync(projectsBase)) return;

	const prefixes = [
		'e2e-',
		'e2e-fullscreen-',
		'reactive-e2e-',
		'map-e2e-',
		'mcs-audit-',
		'mcs-audit',
		'mcs-audit_',
		'mcs-audit.'
	];

	for (const entry of readdirSync(projectsBase, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const name = entry.name;
		if (!prefixes.some((p) => name.startsWith(p))) continue;
		safeRm(join(projectsBase, name));
	}
}

