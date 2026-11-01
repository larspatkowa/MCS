import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import * as renderJobs from '$lib/server/render-jobs.js';

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	return json({ jobs: renderJobs.listRenderJobs(projectPath) });
};

export const POST: RequestHandler = async ({ params, request, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		const requestedBaseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : null;
		if (requestedBaseUrl) {
			let parsedBaseUrl: URL;
			try {
				parsedBaseUrl = new URL(requestedBaseUrl);
			} catch {
				return apiErrorResponse('baseUrl must be a valid URL', 400);
			}
			if (parsedBaseUrl.origin !== url.origin) {
				return apiErrorResponse('baseUrl must match the MCS server origin', 400);
			}
		}
		const spec = renderJobs.validateRenderSpec({
			...body,
			projectId: params.id,
			baseUrl: requestedBaseUrl ?? url.origin
		});
		const job = renderJobs.createRenderJob(projectPath, spec);
		void renderJobs.runRenderJob(projectPath, job.id);
		return json(job, { status: 202 });
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/render-jobs');
	}
};
