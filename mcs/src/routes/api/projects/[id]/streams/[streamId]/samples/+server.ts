import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors';
import { parseSampleRangeQuery } from '$lib/server/query-validation.js';
import { validateIdentifier } from '$lib/server/ingest-validation.js';

/**
 * Historical stream samples for time range.
 * GET /api/projects/:id/streams/:streamId/samples?start=&end=&limit=
 * Returns { data: StreamSample[] }.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	try {
		const streamId = validateIdentifier(params.streamId, 'streamId');
		const rawAfterEventId = url.searchParams.get('afterEventId');
		const { from, to, limit } = parseSampleRangeQuery(
			url.searchParams,
			rawAfterEventId === null ? undefined : 10_000
		);
		let samples: streamsDb.StreamSample[];
		const includeReceivedAt = url.searchParams.get('includeReceivedAt') === '1';
		if (rawAfterEventId !== null) {
			const afterEventId = Number(rawAfterEventId);
			if (!Number.isSafeInteger(afterEventId) || afterEventId < 0) {
				throw new BadRequestError('afterEventId must be a non-negative safe integer');
			}
			samples = streamsDb.getStreamSamplesAfterEventId(
				projectPath,
				streamId,
				afterEventId,
				limit,
				includeReceivedAt
			);
		} else {
			const includeEventIds = url.searchParams.get('includeEventIds') === '1';
			samples = streamsDb.getStreamSamples(
				projectPath,
				streamId,
				from,
				to,
				limit,
				undefined,
				includeEventIds,
				includeReceivedAt
			);
		}
		return json({ data: samples });
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/streams/[streamId]/samples');
	}
};
