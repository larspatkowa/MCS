import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import * as runsDb from '$lib/server/runs-db.js';

/**
 * GET /api/projects/:id/runs
 * Returns the active lifecycle state plus a bounded list of finalized runs.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const rawLimit = url.searchParams.get('limit');
		const limit = rawLimit === null ? 50 : Number(rawLimit);
		if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
			throw new BadRequestError('limit must be an integer from 1 to 200');
		}
		return json({
			active: runsDb.getActiveRun(projectPath),
			runs: runsDb.listRuns(projectPath, limit)
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/runs');
	}
};

/** Start a new recording run. The existing telemetry ingest payload is unchanged. */
export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		if (body.action !== undefined && body.action !== 'start') {
			throw new BadRequestError('action must be start');
		}
		const metadata = body.metadata;
		if (
			metadata !== undefined &&
			(metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))
		) {
			throw new BadRequestError('metadata must be an object');
		}
		const run = runsDb.startRun(
			projectPath,
			(metadata as Record<string, unknown> | undefined) ?? {}
		);
		return json(run, { status: 201 });
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/runs');
	}
};
