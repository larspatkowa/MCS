import { describe, expect, it } from 'vitest';
import { latestAtOrBefore, mergeTimeOrderedSamples } from './time-alignment.js';

describe('telemetry time alignment', () => {
	it('orders late arrivals by event time, uses event IDs for stable ties, and deduplicates retries', () => {
		const merged = mergeTimeOrderedSamples(
			[
				{ timestamp: 2, eventId: 20, value: 2 },
				{ timestamp: 2, eventId: 22, value: 22 }
			],
			[
				{ timestamp: 1, eventId: 21, value: 1 },
				{ timestamp: 2, eventId: 22, value: 999 },
				{ timestamp: 2, eventId: 23, value: 23 }
			],
			10
		);

		expect(merged.map((sample) => sample.eventId)).toEqual([21, 20, 22, 23]);
		expect(merged.find((sample) => sample.eventId === 22)?.value).toBe(22);
	});

	it('keeps the newest bounded window and aligns each column to its latest prior sample', () => {
		const samples = mergeTimeOrderedSamples(
			[
				{ timestamp: 1, value: 1 },
				{ timestamp: 3, value: 3 }
			],
			[
				{ timestamp: 2, value: 2 },
				{ timestamp: 4, value: 4 }
			],
			3
		);
		expect(samples.map((sample) => sample.timestamp)).toEqual([2, 3, 4]);
		expect(latestAtOrBefore(samples, 2.5)?.value).toBe(2);
		expect(latestAtOrBefore(samples, 0)).toBeUndefined();
	});
});
