import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import {
	importRun,
	MAX_RUN_IMPORT_BYTES,
	type RunImportFormat,
	type TimestampUnit
} from '$lib/server/run-import.js';

const FORMATS = new Set<RunImportFormat>(['csv', 'ndjson', 'json']);
const UNITS = new Set<TimestampUnit>(['seconds', 'milliseconds', 'microseconds', 'auto']);

/** Import a complete historical run without opening the live ingest path. */
export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const contentLength = Number(request.headers.get('content-length'));
	if (Number.isFinite(contentLength) && contentLength > MAX_RUN_IMPORT_BYTES + 1024 * 1024) {
		return apiErrorResponse('Run import is larger than 200 MB', 413);
	}
	try {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) throw new BadRequestError('multipart field "file" is required');
		const formatValue = String(form.get('format') ?? '')
			.trim()
			.toLowerCase();
		const unitValue = String(form.get('timestampUnit') ?? 'auto')
			.trim()
			.toLowerCase();
		if (formatValue && !FORMATS.has(formatValue as RunImportFormat)) {
			throw new BadRequestError('format must be csv, ndjson, or json');
		}
		if (!UNITS.has(unitValue as TimestampUnit)) {
			throw new BadRequestError(
				'timestampUnit must be auto, seconds, milliseconds, or microseconds'
			);
		}
		const streamId = String(form.get('streamId') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const result = importRun(projectPath, await file.text(), {
			format: formatValue ? (formatValue as RunImportFormat) : undefined,
			timestampUnit: unitValue as TimestampUnit,
			streamId: streamId || undefined,
			sourceName: file.name,
			metadata: name ? { name } : undefined
		});
		return json(result, { status: 201 });
	} catch (error) {
		return handleApiError(error, 'POST /api/projects/[id]/runs/import');
	}
};
