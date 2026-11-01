import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';
import * as mediaDb from '$lib/server/media-db.js';

export const GET: RequestHandler = ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	return json({
		bindings: mediaDb.listMediaBindings(projectPath, url.searchParams.get('runId') || undefined)
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		if (typeof body.assetId !== 'string' || typeof body.runId !== 'string')
			return apiErrorResponse('assetId and runId are required', 400);
		const binding = mediaDb.upsertMediaBinding(projectPath, {
			assetId: body.assetId,
			runId: body.runId,
			offsetUs: numberValue(body.offsetUs) ?? 0,
			rate: numberValue(body.rate) ?? 1,
			metadata:
				body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
					? (body.metadata as Record<string, unknown>)
					: {}
		});
		return json(binding, { status: 201 });
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/media/bindings');
	}
};

function numberValue(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value))
		throw new BadRequestError('Media timing values must be finite numbers');
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
