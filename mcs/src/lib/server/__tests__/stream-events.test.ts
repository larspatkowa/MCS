import { describe, expect, it } from 'vitest';
import { broadcastStreamEvent, subscribeStreamEvents } from '../stream-events.js';

describe('stream event batching', () => {
	it('preserves every sample in a high-rate delivery window', async () => {
		const events: { timestamp: number; values: Record<string, unknown>; samples?: unknown[] }[] =
			[];
		const unsubscribe = subscribeStreamEvents('stream-events-test', (event) => events.push(event));

		broadcastStreamEvent('stream-events-test', 'sensor:raw', 1, { value: 10 });
		broadcastStreamEvent('stream-events-test', 'sensor:raw', 2, { value: 20 });

		await new Promise((resolve) => setTimeout(resolve, 180));
		unsubscribe();

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			streamId: 'sensor:raw',
			timestamp: 2,
			values: { value: 20 },
			samples: [
				{ timestamp: 1, values: { value: 10 } },
				{ timestamp: 2, values: { value: 20 } }
			]
		});
	});
});
