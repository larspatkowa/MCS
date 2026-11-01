import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TelemetrySample } from '../../telemetry/index.js';
import { createAcquisitionBridge } from '../../telemetry/bridge.js';
import { createV2IngestSender } from '../../telemetry/bridge.js';
import { IngestSpool } from '../ingest-spool.js';

const tempDirs: string[] = [];

function createSpool(options: { maxQueuedSamples?: number; clock?: () => number } = {}) {
	const directory = mkdtempSync(join(tmpdir(), 'mcs-ingest-spool-'));
	tempDirs.push(directory);
	return new IngestSpool({ filename: join(directory, 'spool.sqlite'), ...options });
}

function sample(sequence: number): TelemetrySample {
	return {
		version: 1,
		sourceId: 'radio-a',
		streamId: 'temperature',
		sourceTimestamp: { value: sequence, unit: 'seconds', timeSystem: 'UTC' },
		receivedAt: sequence,
		eventTimeUtc: sequence,
		sequence,
		values: { value: sequence }
	};
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('durable acquisition ingest spool', () => {
	it('retains offline samples and stable IDs in source order across restart', () => {
		const spool = createSpool();
		const first = spool.append(sample(1));
		const second = spool.append(sample(2));
		if (!first.queued || !second.queued) throw new Error('expected queued samples');
		spool.close();

		const directory = tempDirs.at(-1)!;
		const reopened = new IngestSpool({ filename: join(directory, 'spool.sqlite') });
		const rows = reopened.readBatch(10);
		expect(rows.map((row) => row.id)).toEqual([first.id, second.id]);
		expect(rows.map((row) => row.sample.sequence)).toEqual([1, 2]);
		reopened.close();
	});

	it('deletes only samples explicitly accepted by the server', async () => {
		const spool = createSpool();
		const acceptedIds: string[] = [];
		const bridge = createAcquisitionBridge({
			spool,
			send: async (batch) => {
				acceptedIds.push(...batch.map((item) => item.idempotencyKey!));
				return [batch[0].idempotencyKey!, 'id-not-in-this-batch'];
			}
		});
		bridge.enqueue(sample(1));
		bridge.enqueue(sample(2));

		const result = await bridge.flushOnce();
		expect(result).toMatchObject({ status: 'sent', sent: 1, deferred: 1 });
		expect(acceptedIds).toHaveLength(2);
		expect(spool.readBatch(10, Date.now() + 1_000)).toHaveLength(1);
		spool.close();
	});

	it('rejects local idempotency key reuse and sends versioned source envelopes', async () => {
		const spool = createSpool();
		const original = { ...sample(1), idempotencyKey: 'stable-1' };
		spool.append(original);
		expect(() => spool.append({ ...sample(2), idempotencyKey: 'stable-1' })).toThrow(/reused/);

		let sentBody: Record<string, unknown> | null = null;
		const sender = createV2IngestSender({
			endpoint: 'https://mcs.example/api/ingest/v2',
			projectId: 'project-a',
			apiToken: 'secret',
			fetch: async (_input, init) => {
				sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
				return new Response(JSON.stringify({ acceptedIds: ['stable-1'] }), { status: 200 });
			}
		});
		const accepted = await sender([original], new AbortController().signal);
		expect(accepted).toEqual(['stable-1']);
		expect(sentBody).toMatchObject({
			version: 1,
			projectId: 'project-a',
			source: { id: 'radio-a', timeSystem: 'UTC', timestampUnit: 'seconds' },
			samples: [{ idempotencyKey: 'stable-1', sequence: 1 }]
		});
		spool.close();
	});

	it('backs off after failure and resumes the same sample after restart', async () => {
		let now = 0;
		let spool = createSpool({ clock: () => now });
		const bridge = createAcquisitionBridge({
			spool,
			now: () => now,
			baseRetryMs: 100,
			maxRetryMs: 500,
			send: async () => {
				throw new Error('offline');
			}
		});
		const queued = bridge.enqueue(sample(1));
		if (!queued.queued) throw new Error('expected queued sample');
		expect(await bridge.flushOnce()).toMatchObject({ status: 'retry', retryInMs: 100 });
		expect(spool.readBatch(10, now)).toHaveLength(0);
		spool.close();

		const directory = tempDirs.at(-1)!;
		spool = new IngestSpool({ filename: join(directory, 'spool.sqlite'), clock: () => now });
		const restartedBridge = createAcquisitionBridge({
			spool,
			now: () => now,
			send: async (batch) => batch.map((item) => item.idempotencyKey!)
		});
		now = 100;
		const resent = await restartedBridge.flushOnce();
		expect(resent).toMatchObject({ status: 'sent', sent: 1 });
		expect(spool.size).toBe(0);
		spool.close();
	});

	it('sends no more than the configured batch size and reports sequence gaps', async () => {
		const spool = createSpool({ maxQueuedSamples: 2, clock: () => 10_000 });
		const reportedGaps: unknown[] = [];
		const deliveredBatchSizes: number[] = [];
		const bridge = createAcquisitionBridge({
			spool,
			batchSize: 1,
			onGap: (gap) => reportedGaps.push(gap),
			send: async (batch) => {
				deliveredBatchSizes.push(batch.length);
				return batch.map((item) => item.idempotencyKey!);
			}
		});
		bridge.enqueue(sample(1));
		bridge.enqueue(sample(3));
		const overflow = bridge.enqueue(sample(4));
		expect(overflow.queued).toBe(false);
		expect(reportedGaps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ reason: 'sequence-gap', firstMissingSequence: 2 }),
				expect.objectContaining({ reason: 'buffer-overflow', firstMissingSequence: 4 })
			])
		);
		await bridge.flushOnce();
		await bridge.flushOnce();
		expect(deliveredBatchSizes).toEqual([1, 1]);
		spool.close();
	});
});
