import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse } from '$lib/server/errors.js';
import * as renderJobs from '$lib/server/render-jobs.js';

/** Serve one deterministic frame without exposing the project filesystem path. */
export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const frame = Number(params.frame);
	if (!/^\d+$/.test(params.frame) || !Number.isSafeInteger(frame))
		return apiErrorResponse('Invalid render frame', 400);
	try {
		const path = renderJobs.getRenderFramePath(projectPath, params.jobId, frame);
		return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
			headers: {
				'content-type': 'image/png',
				'content-length': String(statSync(path).size),
				'cache-control': 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		return apiErrorResponse('Render frame not found', 404);
	}
};
