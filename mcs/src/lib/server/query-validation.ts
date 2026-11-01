import { BadRequestError } from '$lib/server/errors.js';

export interface SampleRangeQuery {
	from?: number;
	to?: number;
	limit: number;
}

export const MAX_SAMPLE_QUERY_LIMIT = 100_000;

function optionalFiniteNumber(value: string | null, name: string): number | undefined {
	if (value === null) return undefined;
	if (value.trim() === '') throw new BadRequestError(`${name} must be a finite number`);
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new BadRequestError(`${name} must be a finite number`);
	return parsed;
}

export function parseSampleRangeQuery(
	search: URLSearchParams,
	maxLimit = MAX_SAMPLE_QUERY_LIMIT
): SampleRangeQuery {
	const from = optionalFiniteNumber(search.get('start') ?? search.get('from'), 'from');
	const to = optionalFiniteNumber(search.get('end') ?? search.get('to'), 'to');
	const rawLimit = optionalFiniteNumber(search.get('limit'), 'limit');
	if (from !== undefined && to !== undefined && from > to) {
		throw new BadRequestError('from must be less than or equal to to');
	}
	if (
		rawLimit !== undefined &&
		(!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > maxLimit)
	) {
		throw new BadRequestError(`limit must be an integer from 1 to ${maxLimit}`);
	}
	return { from, to, limit: rawLimit ?? maxLimit };
}
