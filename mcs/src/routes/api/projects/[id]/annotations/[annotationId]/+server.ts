import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import { apiErrorResponse } from '$lib/server/errors';

export const DELETE: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const deleted = streamsDb.deleteAnnotation(projectPath, params.annotationId);
	if (!deleted) return apiErrorResponse('Annotation not found', 404);
	return new Response(null, { status: 204 });
};
