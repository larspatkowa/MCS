import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, handleApiError } from '$lib/server/errors.js';
import { parseSampleRangeQuery } from '$lib/server/query-validation.js';
import * as runsDb from '$lib/server/runs-db.js';

/** Full-fidelity recorded events for replay and render jobs. */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const { from, to } = parseSampleRangeQuery(url.searchParams, 250_000);
		const kind = url.searchParams.get('kind');
		if (kind && kind !== 'raw' && kind !== 'derived') {
			return apiErrorResponse('kind must be raw or derived', 400);
		}
		const rawLimit = Number(url.searchParams.get('limit') ?? 50_000);
		const limit = Number.isFinite(rawLimit) ? rawLimit : 50_000;
		return json(
			runsDb.getRunEventPage(projectPath, params.runId, {
				from,
				to,
				streamId: url.searchParams.get('streamId') ?? undefined,
				kind: kind as runsDb.RecordedSampleKind | undefined,
				limit,
				cursor: url.searchParams.get('cursor') ?? undefined
			})
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/runs/[runId]/events');
	}
};
