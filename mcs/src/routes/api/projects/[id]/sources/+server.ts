import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { listSources } from '$lib/server/sources-db.js';

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return json({ error: 'Project not found' }, { status: 404 });
	return json({ sources: listSources(projectPath) }, { headers: { 'Cache-Control': 'no-store' } });
};
