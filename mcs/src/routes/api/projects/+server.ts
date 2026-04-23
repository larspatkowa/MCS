import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolve } from 'path';
import { loadConfig } from '$lib/server/config';
import { readManifest } from '$lib/server/project';
import { createProject } from '$lib/server/project';

export const GET: RequestHandler = async () => {
	const config = loadConfig();
	const projects = config.recentProjectPaths
		.map((path) => {
			const normalizedPath = resolve(path);
			const manifest = readManifest(normalizedPath);
			if (!manifest) return null;
			return { path: normalizedPath, ...manifest };
		})
		.filter((p): p is NonNullable<typeof p> => p !== null);
	return json(projects);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { name, path: projectPath } = body as { name: string; path?: string };
	if (!name || typeof name !== 'string') {
		return json({ error: 'name is required' }, { status: 400 });
	}
	const path = projectPath ?? `./data/projects/${name.replace(/\s+/g, '-')}`;
	const resolved = path.startsWith('/') ? path : resolve(process.cwd(), path);
	try {
		const manifest = createProject(resolved, name, body.notes);
		return json({ path: resolved, ...manifest });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Failed to create project';
		return json({ error: message }, { status: 400 });
	}
};
