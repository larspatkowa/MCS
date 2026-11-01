import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { join, resolve, sep } from 'path';
import { getManagedProjectsDir, loadConfig } from '$lib/server/config';
import { readManifest } from '$lib/server/project';
import { createProject } from '$lib/server/project';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import {
	authenticationRequired,
	listAccessibleProjectIds,
	setProjectMembership
} from '$lib/server/auth.js';

export const GET: RequestHandler = async ({ locals }) => {
	const config = loadConfig();
	const visibleIds =
		authenticationRequired() && locals.authUser ? listAccessibleProjectIds(locals.authUser) : null;
	const projects = config.recentProjectPaths
		.map((path) => {
			const normalizedPath = resolve(path);
			const manifest = readManifest(normalizedPath);
			if (!manifest) return null;
			if (visibleIds && !visibleIds.includes(manifest.id)) return null;
			return { path: normalizedPath, ...manifest };
		})
		.filter((p): p is NonNullable<typeof p> => p !== null);
	return json(projects);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: Record<string, unknown>;
	try {
		body = await readJsonObject(request);
	} catch (error) {
		return handleApiError(error, 'POST /api/projects');
	}
	const { name, path: projectPath } = body as {
		name: string;
		path?: string;
	};
	if (!name || typeof name !== 'string' || !name.trim()) {
		return json({ error: 'name is required' }, { status: 400 });
	}
	if (name.trim().length > 200) return json({ error: 'name is too long' }, { status: 400 });
	if (projectPath !== undefined && typeof projectPath !== 'string') {
		return json({ error: 'path must be a string' }, { status: 400 });
	}
	const slug =
		name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'project';
	const path = projectPath?.trim() || join(getManagedProjectsDir(), slug);
	const resolved = resolve(path);
	const managedRoot = resolve(getManagedProjectsDir());
	if (resolved !== managedRoot && !resolved.startsWith(`${managedRoot}${sep}`)) {
		return json(
			{ error: 'Project path must be inside the managed projects directory' },
			{ status: 400 }
		);
	}
	try {
		const notes = typeof body.notes === 'string' ? body.notes : undefined;
		const manifest = createProject(resolved, name.trim(), notes);
		if (authenticationRequired() && locals.authUser) {
			setProjectMembership(manifest.id, locals.authUser.id, 'admin', locals.authUser.id);
		}
		return json({ path: resolved, ...manifest });
	} catch (e) {
		return handleApiError(e, 'POST /api/projects');
	}
};
