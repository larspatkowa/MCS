import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as limitsDb from '$lib/server/limits-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { readJsonObject, validateIdentifier, validateText } from '$lib/server/ingest-validation.js';

/** GET /api/projects/:id/streams/:streamId/limits — list all limit configs for a stream */
export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	let streamId: string;
	try {
		streamId = validateIdentifier(params.streamId, 'streamId');
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/streams/[streamId]/limits');
	}
	const configs = limitsDb.getLimitConfigs(projectPath, streamId);
	return json(configs);
};

/**
 * PUT /api/projects/:id/streams/:streamId/limits
 * Body: { field, yellowLow?, yellowHigh?, redLow?, redHigh?, enabled? }
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const streamId = validateIdentifier(params.streamId, 'streamId');
		const body = (await readJsonObject(request)) as {
			field?: string;
			yellowLow?: number | null;
			yellowHigh?: number | null;
			redLow?: number | null;
			redHigh?: number | null;
			enabled?: boolean;
		};
		const field = body.field ?? 'value';
		validateText(field, 'field', 200);
		const validField = field.trim() === '*' ? '*' : validateIdentifier(field, 'field');
		for (const key of ['yellowLow', 'yellowHigh', 'redLow', 'redHigh'] as const) {
			const value = body[key];
			if (value !== undefined && value !== null && !Number.isFinite(value)) {
				return apiErrorResponse(`${key} must be a finite number or null`, 400);
			}
		}
		limitsDb.setLimitConfig(projectPath, streamId, validField, {
			yellowLow: body.yellowLow ?? null,
			yellowHigh: body.yellowHigh ?? null,
			redLow: body.redLow ?? null,
			redHigh: body.redHigh ?? null,
			enabled: body.enabled !== false
		});
		const updated = limitsDb.getLimitConfigs(projectPath, streamId);
		return json(updated);
	} catch (error) {
		return handleApiError(error, 'PUT /api/projects/[id]/streams/[streamId]/limits');
	}
};

/**
 * DELETE /api/projects/:id/streams/:streamId/limits?field=value
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const streamId = validateIdentifier(params.streamId, 'streamId');
		const rawField = url.searchParams.get('field') ?? 'value';
		const field = rawField.trim() === '*' ? '*' : validateIdentifier(rawField, 'field');
		const deleted = limitsDb.deleteLimitConfig(projectPath, streamId, field);
		return json({ deleted });
	} catch (error) {
		return handleApiError(error, 'DELETE /api/projects/[id]/streams/[streamId]/limits');
	}
};
