import { join, resolve, sep } from 'path';
import { rmSync } from 'fs';
import { removeRecentProject } from '$lib/server/config';
import { forgetProjectIdCache, getProjectPathById } from '$lib/server/project';
import { stopInProcessForProject } from '$lib/server/plugin-registry';
import { stopPluginsForProject } from '$lib/server/plugin-runner';

const SAFE_PROJECTS_BASE = join(process.cwd(), 'data', 'projects');

export type ProjectDeleteOutcome = { ok: true } | { ok: false; error: string; statusCode: number };

/**
 * Remove a project from recent paths and optionally delete its folder.
 * Same rules as DELETE /api/projects/:id (folder delete only under data/projects).
 */
export function deleteProjectById(id: string, deleteFolder: boolean): ProjectDeleteOutcome {
	const projectPath = getProjectPathById(id);
	if (!projectPath) {
		return { ok: true };
	}

	if (deleteFolder) {
		const resolvedPath = resolve(projectPath);
		const safeBase = resolve(SAFE_PROJECTS_BASE);
		if (resolvedPath !== safeBase && !resolvedPath.startsWith(safeBase + sep)) {
			return {
				ok: false,
				error: 'Project path is outside allowed base; cannot delete folder',
				statusCode: 400
			};
		}
	}

	removeRecentProject(projectPath);

	// Ensure any running plugins tied to this project are stopped before we drop the cache
	// and/or delete the folder, to avoid background ingest errors and log spam.
	try {
		stopInProcessForProject(id);
		stopPluginsForProject(id);
	} catch {
		// best-effort
	}

	forgetProjectIdCache(id);

	if (!deleteFolder) {
		return { ok: true };
	}

	try {
		rmSync(projectPath, { recursive: true });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Failed to delete folder',
				statusCode: 500
			};
		}
	}
	return { ok: true };
}
