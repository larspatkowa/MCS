import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse } from '$lib/server/errors';
import { validateIdentifier } from '$lib/server/ingest-validation.js';

export const DELETE: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	let annotationId: string;
	try {
		annotationId = validateIdentifier(params.annotationId, 'annotationId');
	} catch (error) {
		return apiErrorResponse(error instanceof Error ? error.message : 'Invalid annotationId', 400);
	}
	const deleted = streamsDb.deleteAnnotation(projectPath, annotationId);
	if (!deleted) return apiErrorResponse('Annotation not found', 404);
	return new Response(null, { status: 204 });
};
