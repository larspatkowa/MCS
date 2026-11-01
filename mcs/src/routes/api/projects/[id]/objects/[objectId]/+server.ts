import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as objectsDb from '$lib/server/objects-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import {
	readJsonObject,
	validateIdentifier,
	validateText,
	validateValueObject
} from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	let objectId: string;
	try {
		objectId = validateIdentifier(params.objectId, 'objectId');
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/objects/[objectId]');
	}
	const obj = objectsDb.getObject(projectPath, objectId);
	if (!obj) return apiErrorResponse('Object not found', 404);
	return json(obj);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const objectId = validateIdentifier(params.objectId, 'objectId');
		const body = await readJsonObject(request);
		const { name, notes, props, expectedUpdatedAt } = body as {
			name?: string;
			notes?: string;
			props?: Record<string, unknown>;
			expectedUpdatedAt?: string;
		};
		if (name !== undefined) validateText(name, 'name', 200);
		if (notes !== undefined) validateText(notes, 'notes');
		if (props !== undefined) validateValueObject(props, 'props');
		if (expectedUpdatedAt !== undefined) validateText(expectedUpdatedAt, 'expectedUpdatedAt', 100);
		if (expectedUpdatedAt != null) {
			const current = objectsDb.getObject(projectPath, objectId);
			if (!current) return apiErrorResponse('Object not found', 404);
			if (current.updatedAt !== expectedUpdatedAt) {
				return json(current, { status: 409 });
			}
		}
		objectsDb.updateObject(projectPath, objectId, { name, notes, props });
		const obj = objectsDb.getObject(projectPath, objectId);
		return json(obj ?? {});
	} catch (e) {
		return handleApiError(e, 'PATCH /api/projects/[id]/objects/[objectId]');
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const objectId = validateIdentifier(params.objectId, 'objectId');
		objectsDb.deleteObject(projectPath, objectId);
		return json({ ok: true });
	} catch (e) {
		return handleApiError(e, 'DELETE /api/projects/[id]/objects/[objectId]');
	}
};
