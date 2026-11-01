import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse } from '$lib/server/errors.js';
import * as renderJobs from '$lib/server/render-jobs.js';

export const GET: RequestHandler = ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const job = renderJobs.getRenderJob(projectPath, params.jobId);
		if (!job || job.status !== 'completed') return apiErrorResponse('Render output not ready', 404);
		const path = renderJobs.getRenderOutputPath(projectPath, job.id);
		const size = statSync(path).size;
		const contentType = job.spec.format === 'prores4444' ? 'video/quicktime' : 'video/mp4';
		const headers = new Headers({
			'content-type': contentType,
			'accept-ranges': 'bytes',
			'content-disposition': `attachment; filename="mcs-${job.id}.${job.spec.format === 'prores4444' ? 'mov' : 'mp4'}"`
		});
		const range = request.headers.get('range');
		if (!range) {
			headers.set('content-length', String(size));
			return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers });
		}
		const match = range.match(/^bytes=(\d*)-(\d*)$/);
		if (!match)
			return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
		const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
		const end = match[2] ? Number(match[2]) : size - 1;
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			start < 0 ||
			start >= size ||
			end < start
		)
			return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
		const boundedEnd = Math.min(end, size - 1);
		headers.set('content-range', `bytes ${start}-${boundedEnd}/${size}`);
		headers.set('content-length', String(boundedEnd - start + 1));
		return new Response(
			Readable.toWeb(createReadStream(path, { start, end: boundedEnd })) as ReadableStream,
			{ status: 206, headers }
		);
	} catch (error) {
		return apiErrorResponse(
			error instanceof Error ? error.message : 'Unable to serve render output',
			404
		);
	}
};
