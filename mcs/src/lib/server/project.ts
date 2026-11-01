import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { addRecentProject, loadConfig } from './config.js';
import { initializeProjectDirectory } from '../../../project-format/project.js';

export interface ProjectManifestSettings {
	[key: string]: unknown;
	dateTime?: {
		dateFormat?: string;
		timeFormat?: string;
	};
	/** Render the project root as direct actions instead of the onboarding card. */
	minimalUi?: boolean;
	/** Continuous-history retention window. Saved runs are retained independently. */
	telemetryRetentionDays?: number;
}

export interface ProjectManifest {
	id: string;
	name: string;
	createdAt: string;
	notes?: string;
	settings?: ProjectManifestSettings;
}

const MANIFEST_FILENAME = 'project.json';

// Cache of project ID -> normalized project path so repeated API calls
// during a refresh don't need to rescan all recentProjectPaths on disk.
const projectIdPathCache = new Map<string, string>();

function normalizeProjectPath(path: string): string {
	return resolve(path);
}

function isSafeProjectId(id: string): boolean {
	return id.length > 0 && id.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/.test(id);
}

export function getManifestPath(projectPath: string): string {
	return join(projectPath, MANIFEST_FILENAME);
}

export function readManifest(projectPath: string): ProjectManifest | null {
	const normalizedPath = normalizeProjectPath(projectPath);
	const path = getManifestPath(normalizedPath);
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, 'utf-8');
		const manifest = JSON.parse(raw) as Partial<ProjectManifest>;
		if (
			typeof manifest.id !== 'string' ||
			!manifest.id ||
			typeof manifest.name !== 'string' ||
			!manifest.name.trim() ||
			typeof manifest.createdAt !== 'string' ||
			!manifest.createdAt
		) {
			return null;
		}
		if (
			manifest.settings !== undefined &&
			(!manifest.settings || typeof manifest.settings !== 'object')
		) {
			return null;
		}
		return manifest as ProjectManifest;
	} catch {
		return null;
	}
}

export function writeManifest(projectPath: string, manifest: ProjectManifest): void {
	const normalizedPath = normalizeProjectPath(projectPath);
	if (!existsSync(normalizedPath)) {
		mkdirSync(normalizedPath, { recursive: true });
	}
	const path = getManifestPath(normalizedPath);
	const temporaryPath = `${path}.${randomUUID()}.tmp`;
	try {
		writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
		renameSync(temporaryPath, path);
	} catch (error) {
		rmSync(temporaryPath, { force: true });
		throw error;
	}
}

export function createProject(
	projectPath: string,
	name: string,
	notes?: string,
	settings?: ProjectManifestSettings
): ProjectManifest {
	const normalizedPath = normalizeProjectPath(projectPath);
	const manifest = initializeProjectDirectory(normalizedPath, {
		name,
		notes,
		settings,
		mcsVersion: process.env.MCS_VERSION ?? process.env.npm_package_version ?? 'development'
	}) as ProjectManifest;

	addRecentProject(normalizedPath);
	return manifest;
}

export function isProjectPath(projectPath: string): boolean {
	const normalizedPath = normalizeProjectPath(projectPath);
	return existsSync(getManifestPath(normalizedPath));
}

export function getProjectPathById(id: string): string | null {
	if (typeof id !== 'string' || !isSafeProjectId(id)) return null;
	// First try cached path, but verify the manifest still matches in case
	// the project was moved or deleted.
	const cachedPath = projectIdPathCache.get(id);
	if (cachedPath) {
		const normalizedCachedPath = normalizeProjectPath(cachedPath);
		const manifest = readManifest(normalizedCachedPath);
		if (manifest?.id === id) {
			return normalizedCachedPath;
		}
		// Stale cache entry; drop it and fall through to full scan.
		projectIdPathCache.delete(id);
	}

	const config = loadConfig();
	const configuredPaths = [
		...(config.defaultProjectPath ? [config.defaultProjectPath] : []),
		...config.recentProjectPaths
	].filter((path, index, paths) => paths.indexOf(path) === index);
	for (const path of configuredPaths) {
		const normalizedPath = normalizeProjectPath(path);
		const manifest = readManifest(normalizedPath);
		if (manifest?.id === id) {
			projectIdPathCache.set(id, normalizedPath);
			return normalizedPath;
		}
	}
	return null;
}

/** Drop cached path for a project id (e.g. after delete or when recents change). */
export function forgetProjectIdCache(id: string): void {
	projectIdPathCache.delete(id);
}
