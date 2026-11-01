import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import * as runsDb from '$lib/server/runs-db.js';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import { validateIdentifier, validateText } from '$lib/server/ingest-validation.js';
import { parseSampleRangeQuery } from '$lib/server/query-validation.js';

export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const parsed = parseSampleRangeQuery(url.searchParams);
		const from = parsed.from ?? 0;
		const to = parsed.to ?? Date.now() / 1000;
		const rawRunId = url.searchParams.get('runId');
		const runId = rawRunId ? validateIdentifier(rawRunId, 'runId') : undefined;
		const list = streamsDb.listAnnotations(
			projectPath,
			from,
			to,
			runId,
			Math.min(parsed.limit, 10_000)
		);
		return json(list);
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/annotations');
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		const {
			ts,
			label,
			details,
			runId: requestedRunId
		} = body as {
			ts: number;
			label: string;
			details?: string;
			runId?: string;
		};
		if (!Number.isFinite(ts) || typeof label !== 'string' || !label.trim()) {
			return apiErrorResponse('finite ts and non-empty label required', 400);
		}
		validateText(label, 'label', 500);
		if (details !== undefined) validateText(details, 'details', 16_384);
		const normalizedRunId =
			requestedRunId === undefined ? undefined : validateIdentifier(requestedRunId, 'runId');
		const activeRun = runsDb.getActiveRun(projectPath);
		const runId = normalizedRunId ?? activeRun?.id ?? null;
		if (runId) runsDb.getRun(projectPath, runId);
		const result = streamsDb.createAnnotation(projectPath, ts, label.trim(), details, runId);
		return json(result);
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/annotations');
	}
};
