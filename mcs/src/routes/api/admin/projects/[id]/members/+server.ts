import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	listProjectMemberships,
	setProjectMembership,
	type ProjectRole
} from '$lib/server/auth.js';
import { getProjectPathById, readManifest } from '$lib/server/project.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject, validateIdentifier } from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = ({ params }) => {
	if (!getProjectPathById(params.id)) return json({ error: 'Project not found' }, { status: 404 });
	return json({ members: listProjectMemberships(params.id) });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!getProjectPathById(params.id) || !readManifest(getProjectPathById(params.id)!)) {
		return json({ error: 'Project not found' }, { status: 404 });
	}
	try {
		const body = await readJsonObject(request);
		if (
			typeof body.userId !== 'string' ||
			!['viewer', 'editor', 'admin'].includes(String(body.role))
		) {
			return json({ error: 'userId and a valid project role are required' }, { status: 400 });
		}
		setProjectMembership(
			params.id,
			validateIdentifier(body.userId, 'userId'),
			body.role as ProjectRole,
			locals.authUser?.id
		);
		return json({ ok: true });
	} catch (error) {
		return handleApiError(error, 'PUT /api/admin/projects/[id]/members');
	}
};
