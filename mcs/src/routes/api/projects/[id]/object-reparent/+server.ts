import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as objectsDb from '$lib/server/objects-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	const body = await request.json();
	const { objectId, newParentId, insertBeforeId } = body as {
		objectId?: string;
		newParentId?: string;
		insertBeforeId?: string | null;
	};
	if (!objectId || !newParentId) {
		return apiErrorResponse('objectId and newParentId required', 400);
	}

	try {
		objectsDb.reparentObject(projectPath, objectId, newParentId, insertBeforeId);
		return json({ ok: true });
	} catch (e) {
		return handleApiError(e, 'POST /api/projects/[id]/object-reparent');
	}
};
