import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { performIngest } from '$lib/server/ingest-core';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { readJsonObject, validateProjectId, validateSample } from '$lib/server/ingest-validation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await readJsonObject(request);
		const projectId = validateProjectId(body.projectId);
		const sample = validateSample(body);
		performIngest(projectId, sample.streamId, sample.timestamp, sample.values);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof Error && e.message === 'Project not found') {
			return apiErrorResponse('Project not found', 404);
		}
		return handleApiError(e, 'POST /api/ingest');
	}
};
