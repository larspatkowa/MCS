import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import { getProjectPathById } from '$lib/server/project.js';
import { SQLiteTelemetryProvider } from '$lib/server/sqlite-telemetry-provider.js';
import { MAX_HISTORY_PAGE_SIZE, type TelemetryResolution } from '$lib/telemetry/index.js';
import { validateIdentifier, validateText } from '$lib/server/ingest-validation.js';

function requiredFinite(url: URL, name: string): number {
	const raw = url.searchParams.get(name);
	const value = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
	if (!Number.isFinite(value)) throw new BadRequestError(`${name} must be a finite number`);
	return value;
}

function maxSamplesParameter(url: URL): number {
	const raw = url.searchParams.get('maxSamples') ?? '2000';
	const value = Number(raw);
	if (!Number.isInteger(value) || value < 1 || value > MAX_HISTORY_PAGE_SIZE) {
		throw new BadRequestError(`maxSamples must be an integer from 1 to ${MAX_HISTORY_PAGE_SIZE}`);
	}
	return value;
}

export const GET: RequestHandler = async ({ params, url, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const resolution = (url.searchParams.get('resolution') ?? 'raw') as TelemetryResolution;
		if (!['raw', 'latest', 'minmax'].includes(resolution)) {
			throw new BadRequestError('resolution must be raw, latest, or minmax');
		}
		const cursor = url.searchParams.get('pageCursor') ?? undefined;
		if (cursor !== undefined && cursor.length > 4096)
			throw new BadRequestError('pageCursor is too long');
		const fieldValue = url.searchParams.get('field');
		const query = {
			sourceId: validateIdentifier(url.searchParams.get('sourceId'), 'sourceId'),
			streamId: validateIdentifier(url.searchParams.get('streamId'), 'streamId'),
			from: requiredFinite(url, 'from'),
			to: requiredFinite(url, 'to'),
			resolution,
			maxSamples: maxSamplesParameter(url),
			...(fieldValue === null ? {} : { field: validateText(fieldValue, 'field', 200).trim() }),
			...(cursor === undefined ? {} : { pageCursor: cursor })
		};
		const provider = new SQLiteTelemetryProvider(params.id, projectPath);
		return json(await provider.query(query, request.signal), {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/telemetry/history');
	}
};
