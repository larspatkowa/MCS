import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { performIngestBatch } from '$lib/server/ingest-core';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors';
import {
	MAX_BATCH_SIZE,
	readJsonObject,
	validateBatchSize,
	validateProjectId,
	validateSample
} from '$lib/server/ingest-validation';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await readJsonObject(request);
		const projectId = validateProjectId(body.projectId);
		validateBatchSize(body.samples);
		let runId: string | undefined;
		if (body.runId !== undefined) {
			if (typeof body.runId !== 'string' || !body.runId.trim()) {
				throw new BadRequestError('runId must be a non-empty string');
			}
			runId = body.runId.trim();
		}
		const now = Date.now() / 1000;
		const samples = body.samples.map((sample) => validateSample(sample, now));
		const recordingRunId = performIngestBatch(projectId, samples, runId);
		return json({ ok: true, count: samples.length, runId: recordingRunId });
	} catch (e) {
		if (e instanceof Error && e.message === 'Project not found') {
			return apiErrorResponse('Project not found', 404);
		}
		return handleApiError(e, 'POST /api/ingest/batch');
	}
};
