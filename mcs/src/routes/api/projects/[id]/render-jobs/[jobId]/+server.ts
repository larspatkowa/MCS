import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse } from '$lib/server/errors.js';
import * as renderJobs from '$lib/server/render-jobs.js';

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const job = renderJobs.getRenderJob(projectPath, params.jobId);
	if (!job) return apiErrorResponse('Render job not found', 404);
	const base = `/api/projects/${encodeURIComponent(params.id)}/render-jobs/${encodeURIComponent(job.id)}`;
	return json({
		...job,
		downloadUrl: job.status === 'completed' && job.outputPath ? `${base}/file` : null,
		frameSequenceUrl:
			job.status === 'completed' && typeof job.manifest.frameCount === 'number'
				? `${base}/frames/{frame}`
				: null
	});
};
