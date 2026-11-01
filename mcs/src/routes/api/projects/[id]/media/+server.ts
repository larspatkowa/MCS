import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import * as mediaDb from '$lib/server/media-db.js';

export const GET: RequestHandler = ({ params, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const runId = url.searchParams.get('runId') || undefined;
	return json({
		assets: mediaDb.listMediaAssets(projectPath),
		bindings: mediaDb.listMediaBindings(projectPath, runId)
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) return apiErrorResponse('multipart field "file" is required', 400);
		const asset = await mediaDb.importMediaAsset(projectPath, {
			sourceName: file.name,
			mimeType: file.type || 'application/octet-stream',
			data: new Uint8Array(await file.arrayBuffer())
		});
		const runId = String(form.get('runId') ?? '').trim();
		const binding = runId
			? mediaDb.upsertMediaBinding(projectPath, {
					assetId: asset.id,
					runId,
					offsetUs: parseNumber(form.get('offsetUs'), 'offsetUs') ?? 0,
					rate: parseNumber(form.get('rate'), 'rate') ?? 1
				})
			: null;
		return json(
			{
				asset,
				binding,
				url: `/api/projects/${encodeURIComponent(params.id)}/media/${encodeURIComponent(asset.id)}/file`
			},
			{ status: 201 }
		);
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/media');
	}
};

function parseNumber(value: FormDataEntryValue | null, label: string): number | undefined {
	if (value === null || typeof value !== 'string' || value.trim() === '') return undefined;
	const number = Number(value);
	if (!Number.isFinite(number)) throw new BadRequestError(`${label} must be finite`);
	return number;
}
