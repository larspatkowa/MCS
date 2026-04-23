import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as limitsDb from '$lib/server/limits-db';
import { apiErrorResponse } from '$lib/server/errors';

/**
 * GET /api/projects/:id/limit-events
 * Query params: from (unix sec), to (unix sec), unackedOnly (bool), streamId
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const now = Date.now() / 1000;
	const from = Number(url.searchParams.get('from')) || now - 3600;
	const to = Number(url.searchParams.get('to')) || now;
	const unackedOnly = url.searchParams.get('unackedOnly') === 'true';
	const streamId = url.searchParams.get('streamId') ?? undefined;
	const events = limitsDb.listLimitEvents(projectPath, from, to, { unackedOnly, streamId });
	return json(events);
};

/**
 * POST /api/projects/:id/limit-events/ack-all
 * Body: { streamId? }
 */
export const POST: RequestHandler = async ({ params, url, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	// Handle /ack-all action via query param
	if (url.searchParams.get('action') === 'ack-all') {
		let streamId: string | undefined;
		try {
			const body = (await request.json()) as { streamId?: string };
			streamId = body.streamId;
		} catch {
			// no body
		}
		const count = limitsDb.ackAllLimitEvents(projectPath, { streamId });
		return json({ acked: count });
	}
	return apiErrorResponse('Unknown action', 400);
};
