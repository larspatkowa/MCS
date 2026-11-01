import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyDerivedTransform, parseTransformText } from '$lib/derived-values.js';
import { getProjectPathById } from '$lib/server/project.js';
import * as streamsDb from '$lib/server/streams-db.js';
import { BadRequestError, apiErrorResponse, handleApiError } from '$lib/server/errors.js';
import {
	readJsonObject,
	validateIdentifier,
	validateText,
	validateValueObject
} from '$lib/server/ingest-validation.js';
import { parseSampleRangeQuery } from '$lib/server/query-validation.js';

/** Apply a bounded, deterministic transform to a copy of a stream's samples. */
export const POST: RequestHandler = async ({ params, request, url }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const streamId = validateIdentifier(params.streamId, 'streamId');
		const body = await readJsonObject(request);
		const range = parseSampleRangeQuery(url.searchParams);
		const source = streamsDb
			.getStreamSamples(projectPath, streamId, range.from, range.to, range.limit)
			.filter((sample) => Number.isFinite(sample.timestamp) && Number.isFinite(sample.value))
			.map((sample) => ({ timestamp: sample.timestamp, value: sample.value }));

		let definition: unknown;
		if (body.text !== undefined) {
			definition = parseTransformText(validateText(body.text, 'text', 4_096));
		} else if (body.transform !== undefined) {
			validateValueObject(body.transform, 'transform');
			definition = body.transform;
		} else {
			throw new BadRequestError('transform or text is required');
		}
		const result = applyDerivedTransform(source, definition);
		return json({
			data: result.samples.slice(0, range.limit),
			skipped: result.skipped,
			warnings: result.warnings
		});
	} catch (error) {
		if (error instanceof Error && !(error instanceof BadRequestError)) {
			// The transform module intentionally throws plain Errors. Convert them
			// to a safe client-facing validation response.
			return handleApiError(
				new BadRequestError(error.message),
				'POST /api/projects/[id]/streams/[streamId]/derived'
			);
		}
		return handleApiError(error, 'POST /api/projects/[id]/streams/[streamId]/derived');
	}
};
