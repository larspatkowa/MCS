import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, handleApiError } from '$lib/server/errors.js';
import { parseSampleRangeQuery } from '$lib/server/query-validation.js';
import * as runsDb from '$lib/server/runs-db.js';

/** Replay is always explicit and bounded per run/stream series. */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const { from, to, limit } = parseSampleRangeQuery(url.searchParams);
		const streamId = url.searchParams.get('streamId') ?? undefined;
		return json(runsDb.getRunReplay(projectPath, params.runId, { from, to, limit, streamId }));
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/runs/[runId]/replay');
	}
};
