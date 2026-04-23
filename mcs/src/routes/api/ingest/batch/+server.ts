import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { performIngest } from '$lib/server/ingest-core';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { projectId, samples } = body as {
		projectId: string;
		samples: { streamId: string; timestamp?: number; values?: Record<string, unknown> }[];
	};
	if (!projectId || !Array.isArray(samples)) {
		return apiErrorResponse('projectId and samples array required', 400);
	}
	let count = 0;
	try {
		for (const s of samples) {
			if (!s?.streamId) continue;
			const ts = typeof s.timestamp === 'number' ? s.timestamp : Date.now() / 1000;
			const payload = s.values && typeof s.values === 'object' ? s.values : {};
			performIngest(projectId, s.streamId, ts, payload);
			count++;
		}
		return json({ ok: true, count });
	} catch (e) {
		if (e instanceof Error && e.message === 'Project not found') {
			return apiErrorResponse('Project not found', 404);
		}
		return handleApiError(e, 'POST /api/ingest/batch');
	}
};
