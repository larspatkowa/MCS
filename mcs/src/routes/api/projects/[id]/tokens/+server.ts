import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createProjectApiToken,
	listProjectApiTokens,
	revokeProjectApiToken
} from '$lib/server/auth.js';
import { getProjectPathById } from '$lib/server/project.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = ({ params }) => {
	if (!getProjectPathById(params.id)) return json({ error: 'Project not found' }, { status: 404 });
	return json({ tokens: listProjectApiTokens(params.id) });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!getProjectPathById(params.id)) return json({ error: 'Project not found' }, { status: 404 });
	if (!locals.authUser || locals.projectRole !== 'admin')
		return json({ error: 'Project administrator access required' }, { status: 403 });
	try {
		const body = await readJsonObject(request);
		const label = typeof body.label === 'string' ? body.label : 'Acquisition bridge';
		const token = createProjectApiToken(params.id, label, locals.authUser.id);
		return json(
			{ token, warning: 'Copy this token now. It cannot be retrieved later.' },
			{ status: 201 }
		);
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/tokens');
	}
};

export const DELETE: RequestHandler = ({ params, url, locals }) => {
	if (!getProjectPathById(params.id)) return json({ error: 'Project not found' }, { status: 404 });
	if (!locals.authUser || locals.projectRole !== 'admin')
		return json({ error: 'Project administrator access required' }, { status: 403 });
	const prefix = url.searchParams.get('prefix');
	if (!prefix) return json({ error: 'prefix is required' }, { status: 400 });
	return json({ ok: revokeProjectApiToken(params.id, prefix, locals.authUser.id) });
};
