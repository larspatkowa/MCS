import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ProjectMeta {
	/** Independent of SemVer; increments when on-disk project layout/meaning changes. */
	projectFormatVersion: number;
	/** MCS version that last migrated/wrote project state. */
	lastMigratedByMcsVersion: string;
	lastMigratedAt: string;
}

const META_DIR = '.mcs';
const META_FILENAME = 'meta.json';

export function writeProjectMeta(projectPath: string, meta: ProjectMeta): void {
	const base = resolve(projectPath);
	const dir = join(base, META_DIR);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const path = join(dir, META_FILENAME);
	writeFileSync(path, JSON.stringify(meta, null, 2), 'utf-8');
}
