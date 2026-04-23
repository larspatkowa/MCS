import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const from = Number(url.searchParams.get('from')) || 0;
	const to = Number(url.searchParams.get('to')) || Date.now() / 1000;
	const list = streamsDb.listAnnotations(projectPath, from, to);
	return json(list);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const body = await request.json();
	const { ts, label, details } = body as { ts: number; label: string; details?: string };
	if (typeof ts !== 'number' || !label) return apiErrorResponse('ts and label required', 400);
	const result = streamsDb.createAnnotation(projectPath, ts, label, details);
	return json(result);
};
