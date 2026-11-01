import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse } from '$lib/server/errors.js';
import * as mediaDb from '$lib/server/media-db.js';

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const asset = mediaDb.getMediaAsset(projectPath, params.assetId);
	if (!asset) return apiErrorResponse('Media asset not found', 404);
	return json({
		asset,
		url: `/api/projects/${encodeURIComponent(params.id)}/media/${encodeURIComponent(asset.id)}/file`
	});
};
