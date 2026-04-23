import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { getDb } from './db.js';
import { addRecentProject, loadConfig } from './config.js';
import { writeProjectMeta } from './project-meta.js';
import type { TutorialExampleKind } from '$lib/tutorial-kinds.js';

export interface ProjectManifestSettings {
	dateTime?: {
		dateFormat?: string;
		timeFormat?: string;
	};
	autoStartPlugins?: string[];
	/** Set for example projects so the in-app tour uses matching copy. */
	tutorialExampleKind?: TutorialExampleKind;
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

export function getManifestPath(projectPath: string): string {
	return join(projectPath, MANIFEST_FILENAME);
}

export function readManifest(projectPath: string): ProjectManifest | null {
	const normalizedPath = normalizeProjectPath(projectPath);
	const path = getManifestPath(normalizedPath);
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path, 'utf-8');
		return JSON.parse(raw) as ProjectManifest;
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
	writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function createProject(projectPath: string, name: string, notes?: string): ProjectManifest {
	const normalizedPath = normalizeProjectPath(projectPath);
	if (existsSync(normalizedPath)) {
		const existing = readManifest(normalizedPath);
		if (existing) throw new Error('Project already exists at this path');
	}
	mkdirSync(normalizedPath, { recursive: true });
	const id = randomUUID();
	const now = new Date().toISOString();
	const manifest: ProjectManifest = { id, name, createdAt: now, notes };
	writeManifest(normalizedPath, manifest);

	// Create root project object in objects table
	const db = getDb(normalizedPath);
	const rootId = id; // use same id as project for root object
	db.prepare(
		`INSERT INTO objects (id, type, parent_id, sort_order, name, notes, props, created_at, updated_at)
     VALUES (?, 'project', NULL, 0, ?, ?, '{}', ?, ?)`
	).run(rootId, name, notes ?? '', now, now);

	// Per-project metadata for migrations/reproducibility. This is separate from the app manifest.
	writeProjectMeta(normalizedPath, {
		projectFormatVersion: 1,
		lastMigratedByMcsVersion: process.env.npm_package_version ?? 'unknown',
		lastMigratedAt: now
	});

	addRecentProject(normalizedPath);
	return manifest;
}

export function isProjectPath(projectPath: string): boolean {
	const normalizedPath = normalizeProjectPath(projectPath);
	return existsSync(getManifestPath(normalizedPath));
}

export function getProjectPathById(id: string): string | null {
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
	for (const path of config.recentProjectPaths) {
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
