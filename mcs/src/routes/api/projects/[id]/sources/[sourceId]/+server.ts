import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { getSource, upsertSource, type SourceConfigInput } from '$lib/server/sources-db.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject, validateIdentifier } from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return json({ error: 'Project not found' }, { status: 404 });
	const sourceId = validateIdentifier(params.sourceId, 'sourceId');
	const source = getSource(projectPath, sourceId);
	return source ? json(source) : json({ error: 'Source not found' }, { status: 404 });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return json({ error: 'Project not found' }, { status: 404 });
	try {
		const sourceId = validateIdentifier(params.sourceId, 'sourceId');
		const body = await readJsonObject(request);
		return json(upsertSource(projectPath, sourceId, body as SourceConfigInput));
	} catch (error) {
		return handleApiError(error, 'PUT /api/projects/[id]/sources/[sourceId]');
	}
};
