import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as limitsDb from '$lib/server/limits-db';
import { apiErrorResponse } from '$lib/server/errors';

/** GET /api/projects/:id/streams/:streamId/limits — list all limit configs for a stream */
export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const configs = limitsDb.getLimitConfigs(projectPath, params.streamId);
	return json(configs);
};

/**
 * PUT /api/projects/:id/streams/:streamId/limits
 * Body: { field, yellowLow?, yellowHigh?, redLow?, redHigh?, enabled? }
 */
export const PUT: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const body = (await request.json()) as {
		field?: string;
		yellowLow?: number | null;
		yellowHigh?: number | null;
		redLow?: number | null;
		redHigh?: number | null;
		enabled?: boolean;
	};
	const field = body.field ?? 'value';
	limitsDb.setLimitConfig(projectPath, params.streamId, field, {
		yellowLow: body.yellowLow ?? null,
		yellowHigh: body.yellowHigh ?? null,
		redLow: body.redLow ?? null,
		redHigh: body.redHigh ?? null,
		enabled: body.enabled !== false
	});
	const updated = limitsDb.getLimitConfigs(projectPath, params.streamId);
	return json(updated);
};

/**
 * DELETE /api/projects/:id/streams/:streamId/limits?field=value
 */
export const DELETE: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const field = url.searchParams.get('field') ?? 'value';
	const deleted = limitsDb.deleteLimitConfig(projectPath, params.streamId, field);
	return json({ deleted });
};
