import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import {
	readJsonObject,
	validateIdentifier,
	validateText,
	validateValueObject
} from '$lib/server/ingest-validation.js';
import { parseSampleRangeQuery } from '$lib/server/query-validation.js';

export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	let streamId: string;
	try {
		streamId = validateIdentifier(params.streamId, 'streamId');
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/streams/[streamId]');
	}

	const search = url.searchParams;
	const hasRangeParams = search.has('from') || search.has('to');

	if (hasRangeParams) {
		try {
			const { from, to, limit } = parseSampleRangeQuery(search);
			const samples = streamsDb.getStreamSamples(projectPath, streamId, from, to, limit);
			if (samples.length === 0) {
				const last = streamsDb.getStreamLast(projectPath, streamId);
				if (!last) return apiErrorResponse('Stream not found', 404);
			}
			return json({ data: samples });
		} catch (error) {
			return handleApiError(error, 'GET /api/projects/[id]/streams/[streamId]');
		}
	}

	const last = streamsDb.getStreamLast(projectPath, streamId);
	if (!last) return apiErrorResponse('Stream not found', 404);
	return json(last);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	try {
		const streamId = validateIdentifier(params.streamId, 'streamId');
		const body = await readJsonObject(request);
		const { name, metadata } = body as {
			name?: string;
			metadata?: Record<string, unknown>;
		};
		if (metadata == null && name == null) {
			return apiErrorResponse('name or metadata required', 400);
		}
		if (name !== undefined) validateText(name, 'name', 200);
		if (metadata !== undefined) validateValueObject(metadata, 'metadata');
		streamsDb.updateStreamMetadata(projectPath, streamId, metadata ?? {}, name);
		return json({ ok: true });
	} catch (e) {
		return handleApiError(e, 'PUT /api/projects/[id]/streams/[streamId]');
	}
};
