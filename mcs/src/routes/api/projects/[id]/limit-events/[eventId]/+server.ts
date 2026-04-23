import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as limitsDb from '$lib/server/limits-db';
import { apiErrorResponse } from '$lib/server/errors';

/** PATCH /api/projects/:id/limit-events/:eventId  — acknowledge event */
export const PATCH: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const acked = limitsDb.ackLimitEvent(projectPath, params.eventId);
	if (!acked) return apiErrorResponse('Event not found or already acked', 404);
	return json({ acked: true });
};

/** DELETE /api/projects/:id/limit-events/:eventId */
export const DELETE: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const deleted = limitsDb.deleteLimitEvent(projectPath, params.eventId);
	if (!deleted) return apiErrorResponse('Event not found', 404);
	return new Response(null, { status: 204 });
};
