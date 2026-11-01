import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as objectsDb from '$lib/server/objects-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { readJsonObject, validateIdentifier } from '$lib/server/ingest-validation.js';

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	try {
		const body = await readJsonObject(request);
		const { parentId, childIds } = body as { parentId?: string; childIds?: string[] };
		if (!parentId || !Array.isArray(childIds)) {
			return apiErrorResponse('parentId and childIds (array) required', 400);
		}
		const validParentId = validateIdentifier(parentId, 'parentId');
		if (childIds.length > 2_000) return apiErrorResponse('Too many child IDs', 400);
		const validChildIds = childIds.map((id) => validateIdentifier(id, 'childId'));

		objectsDb.reorderChildren(projectPath, validParentId, validChildIds);
		return json({ ok: true });
	} catch (e) {
		return handleApiError(e, 'POST /api/projects/[id]/object-reorder');
	}
};
