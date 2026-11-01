import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiErrorResponse, handleApiError } from '$lib/server/errors.js';
import { getProjectPathById } from '$lib/server/project.js';
import { SQLiteTelemetryProvider } from '$lib/server/sqlite-telemetry-provider.js';
import { validateIdentifier } from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = async ({ params, url, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const rawSourceId = url.searchParams.get('sourceId');
		const sourceId = rawSourceId === null ? undefined : validateIdentifier(rawSourceId, 'sourceId');
		const provider = new SQLiteTelemetryProvider(params.id, projectPath);
		const sources = await provider.getMetadata(sourceId, request.signal);
		return json(
			{ provider: provider.id, capabilities: provider.getCapabilities(), sources },
			{
				headers: { 'Cache-Control': 'no-store' }
			}
		);
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/telemetry/metadata');
	}
};
