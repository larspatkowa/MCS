import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import * as runsDb from '$lib/server/runs-db.js';

export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const run = runsDb.getRun(projectPath, params.runId);
		return json({
			run,
			healthMetrics: runsDb.listHealthMetrics(projectPath, params.runId)
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/runs/[runId]');
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		if (typeof body.action !== 'string' || !['pause', 'resume', 'stop'].includes(body.action)) {
			throw new BadRequestError('action must be pause, resume, or stop');
		}
		const run =
			body.action === 'pause'
				? runsDb.pauseRun(projectPath, params.runId)
				: body.action === 'resume'
					? runsDb.resumeRun(projectPath, params.runId)
					: runsDb.stopRun(projectPath, params.runId);
		return json(run);
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/runs/[runId]');
	}
};
