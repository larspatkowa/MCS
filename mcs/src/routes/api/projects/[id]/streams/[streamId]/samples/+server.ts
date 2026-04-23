import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse } from '$lib/server/errors';

/**
 * Historical stream samples for time range.
 * GET /api/projects/:id/streams/:streamId/samples?start=&end=&limit=
 * Returns { data: StreamSample[] }.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	const startStr = url.searchParams.get('start') ?? url.searchParams.get('from');
	const endStr = url.searchParams.get('end') ?? url.searchParams.get('to');
	const limitStr = url.searchParams.get('limit');

	const from = startStr != null ? Number(startStr) : undefined;
	const to = endStr != null ? Number(endStr) : undefined;
	const limit = limitStr != null ? Number(limitStr) : undefined;

	const samples = streamsDb.getStreamSamples(projectPath, params.streamId, from, to, limit);
	return json({ data: samples });
};
