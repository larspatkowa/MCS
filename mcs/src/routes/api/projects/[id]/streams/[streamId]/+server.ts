import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	const search = url.searchParams;
	const hasRangeParams = search.has('from') || search.has('to');

	if (hasRangeParams) {
		const fromStr = search.get('from');
		const toStr = search.get('to');
		const limitStr = search.get('limit');

		const from = fromStr != null ? Number(fromStr) : undefined;
		const to = toStr != null ? Number(toStr) : undefined;
		const limit = limitStr != null ? Number(limitStr) : undefined;

		const samples = streamsDb.getStreamSamples(projectPath, params.streamId, from, to, limit);
		if (samples.length === 0) {
			const last = streamsDb.getStreamLast(projectPath, params.streamId);
			if (!last) return apiErrorResponse('Stream not found', 404);
		}
		return json({ data: samples });
	}

	const last = streamsDb.getStreamLast(projectPath, params.streamId);
	if (!last) return apiErrorResponse('Stream not found', 404);
	return json(last);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	const body = await request.json();
	const {
		name,
		metadata
	}: {
		name?: string;
		metadata?: Record<string, unknown>;
	} = body;

	if (metadata == null && name == null) {
		return apiErrorResponse('name or metadata required', 400);
	}

	try {
		streamsDb.updateStreamMetadata(projectPath, params.streamId, metadata ?? {}, name);
		return json({ ok: true });
	} catch (e) {
		return handleApiError(e, 'PUT /api/projects/[id]/streams/[streamId]');
	}
};
