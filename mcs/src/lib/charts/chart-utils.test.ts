import { describe, expect, it } from 'vitest';
import { formatTimestamp, parseSeriesSource, seriesValue, splitAtGaps } from './chart-utils.js';
import { formatDateTime } from '../date-time-format.js';

const at = (timestamps: number[]) => timestamps.map((timestamp) => ({ timestamp }));

describe('splitAtGaps', () => {
	it('keeps a regularly sampled series as one run', () => {
		expect(splitAtGaps(at([0, 1, 2, 3, 4]))).toHaveLength(1);
	});

	it('starts a new run after a step much longer than the median interval', () => {
		const runs = splitAtGaps(at([0, 1, 2, 3, 40, 41, 42]));
		expect(runs.map((run) => run.map((point) => point.timestamp))).toEqual([
			[0, 1, 2, 3],
			[40, 41, 42]
		]);
	});

	it('tolerates jitter below the gap factor', () => {
		expect(splitAtGaps(at([0, 1, 2.5, 3, 4.2, 5]))).toHaveLength(1);
	});

	it('handles empty and tiny series', () => {
		expect(splitAtGaps([])).toEqual([]);
		expect(splitAtGaps(at([5]))).toHaveLength(1);
	});
});

describe('UTC time display', () => {
	const t = Date.UTC(2026, 9, 31, 23, 48, 20) / 1000;

	it('labels plot axes in UTC regardless of the browser zone', () => {
		expect(formatTimestamp(t, 60)).toBe('23:48:20');
		expect(formatTimestamp(t, 3600)).toBe('23:48');
	});

	it('marks UTC clock readings explicitly', () => {
		const text = formatDateTime(new Date(t * 1000), { utc: true }, 'en-GB');
		expect(text).toBe('2026/10/31 23:48:20 UTC');
	});
});

describe('series sources', () => {
	it('selects one field of a multi-field stream', () => {
		expect(parseSeriesSource('vehicle:state#vel')).toEqual({
			streamId: 'vehicle:state',
			field: 'vel'
		});
		expect(parseSeriesSource('engine:chamber')).toEqual({ streamId: 'engine:chamber' });
		expect(seriesValue({ alt: 10, vel: 3 }, 'vel')).toBe(3);
		expect(seriesValue({ alt: 10, vel: 3 })).toBe(10);
		expect(seriesValue({ value: 7, alt: 1 })).toBe(7);
		expect(seriesValue({ alt: 'n/a' }, 'alt')).toBeNaN();
	});
});
