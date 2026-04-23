import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as objectsDb from '$lib/server/objects-db';
import * as projectChanges from '$lib/server/project-changes';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const obj = objectsDb.getObject(projectPath, params.objectId);
	if (!obj) return apiErrorResponse('Object not found', 404);
	return json(obj);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const body = await request.json();
	const { name, notes, props, expectedUpdatedAt } = body as {
		name?: string;
		notes?: string;
		props?: Record<string, unknown>;
		expectedUpdatedAt?: string;
	};
	try {
		if (expectedUpdatedAt != null) {
			const current = objectsDb.getObject(projectPath, params.objectId);
			if (!current) return apiErrorResponse('Object not found', 404);
			if (current.updatedAt !== expectedUpdatedAt) {
				return json(current, { status: 409 });
			}
		}
		objectsDb.updateObject(projectPath, params.objectId, { name, notes, props });
		projectChanges.notify(params.id, { type: 'object-updated', objectId: params.objectId });
		const obj = objectsDb.getObject(projectPath, params.objectId);
		return json(obj ?? {});
	} catch (e) {
		return handleApiError(e, 'PATCH /api/projects/[id]/objects/[objectId]');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		objectsDb.deleteObject(projectPath, params.objectId);
		projectChanges.notify(params.id, { type: 'tree-changed' });
		return json({ ok: true });
	} catch (e) {
		return handleApiError(e, 'DELETE /api/projects/[id]/objects/[objectId]');
	}
};
