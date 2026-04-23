import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { performIngest } from '$lib/server/ingest-core';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { projectId, streamId, timestamp, values } = body as {
		projectId: string;
		streamId: string;
		timestamp?: number;
		values?: Record<string, unknown>;
	};
	if (!projectId || !streamId) return apiErrorResponse('projectId and streamId required', 400);
	const ts = typeof timestamp === 'number' ? timestamp : Date.now() / 1000;
	const payload = values && typeof values === 'object' ? values : {};
	try {
		performIngest(projectId, streamId, ts, payload);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof Error && e.message === 'Project not found') {
			return apiErrorResponse('Project not found', 404);
		}
		return handleApiError(e, 'POST /api/ingest');
	}
};
