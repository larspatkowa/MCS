import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import * as mediaDb from '$lib/server/media-db.js';

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const binding = mediaDb.getMediaBinding(projectPath, params.bindingId);
	return binding ? json(binding) : apiErrorResponse('Media binding not found', 404);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		if (!Array.isArray(body.anchors)) return apiErrorResponse('anchors must be an array', 400);
		const anchors = body.anchors.map((value) => {
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new BadRequestError('Each anchor must be an object');
			const anchor = value as Record<string, unknown>;
			if (
				typeof anchor.mediaTimeUs !== 'number' ||
				!Number.isFinite(anchor.mediaTimeUs) ||
				typeof anchor.runTimeUs !== 'number' ||
				!Number.isFinite(anchor.runTimeUs)
			)
				throw new BadRequestError('Each anchor needs finite mediaTimeUs and runTimeUs');
			return {
				mediaTimeUs: anchor.mediaTimeUs,
				runTimeUs: anchor.runTimeUs,
				label: typeof anchor.label === 'string' ? anchor.label : undefined
			};
		});
		return json(mediaDb.replaceMediaAnchors(projectPath, params.bindingId, anchors));
	} catch (error) {
		return handleApiError(error, 'PUT /api/projects/[id]/media/bindings/[bindingId]');
	}
};
