import type { TelemetrySample } from './index.js';
import type {
	EnqueueResult,
	IngestSpool,
	QueuedIngestSample,
	SpoolGap
} from '../server/ingest-spool.js';

export interface AcquisitionBridgeOptions {
	spool: IngestSpool;
	/** Return only stable IDs the receiving server accepted. */
	send: (samples: readonly TelemetrySample[], signal: AbortSignal) => Promise<readonly string[]>;
	batchSize?: number;
	baseRetryMs?: number;
	maxRetryMs?: number;
	idlePollMs?: number;
	now?: () => number;
	onGap?: (gap: SpoolGap) => void;
}

export interface V2IngestSenderOptions {
	endpoint: string;
	projectId: string;
	apiToken?: string;
	sourceName?: string;
	fetch?: typeof fetch;
}

/** Concrete bridge transport for the versioned MCS ingest endpoint. */
export function createV2IngestSender(
	options: V2IngestSenderOptions
): AcquisitionBridgeOptions['send'] {
	const fetcher = options.fetch ?? fetch;
	return async (samples, signal) => {
		if (samples.length === 0) return [];
		const first = samples[0];
		if (samples.some((sample) => sample.sourceId !== first.sourceId)) {
			throw new Error('A v2 ingest batch must contain one source; use one bridge per source');
		}
		const response = await fetcher(options.endpoint, {
			method: 'POST',
			signal,
			headers: {
				'Content-Type': 'application/json',
				...(options.apiToken ? { Authorization: `Bearer ${options.apiToken}` } : {})
			},
			body: JSON.stringify({
				version: 1,
				projectId: options.projectId,
				source: {
					id: first.sourceId,
					...(options.sourceName ? { name: options.sourceName } : {}),
					timeSystem: first.sourceTimestamp.timeSystem,
					timestampUnit: first.sourceTimestamp.unit
				},
				samples: samples.map((sample) => ({
					streamId: sample.streamId,
					sourceTimestamp: sample.sourceTimestamp,
					...(sample.sequence === undefined ? {} : { sequence: sample.sequence }),
					...(sample.idempotencyKey === undefined ? {} : { idempotencyKey: sample.idempotencyKey }),
					values: sample.values,
					...(sample.quality ? { quality: sample.quality } : {}),
					...(sample.provenance ? { provenance: sample.provenance } : {})
				}))
			})
		});
		if (!response.ok) throw new Error(`MCS ingest returned HTTP ${response.status}`);
		const result = (await response.json()) as { acceptedIds?: unknown };
		if (
			!Array.isArray(result.acceptedIds) ||
			result.acceptedIds.some((id) => typeof id !== 'string')
		) {
			throw new Error('MCS ingest response did not include acceptedIds');
		}
		return result.acceptedIds as string[];
	};
}

export type FlushResult =
	| { status: 'sent'; sent: number; deferred: number; retryInMs?: number }
	| { status: 'empty' }
	| { status: 'busy' }
	| { status: 'aborted' }
	| { status: 'retry'; deferred: number; retryInMs: number };

function abortError(): Error {
	const error = new Error('Acquisition bridge stopped');
	error.name = 'AbortError';
	return error;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return Promise.reject(abortError());
	return new Promise((resolve, reject) => {
		const timer = setTimeout(done, ms);
		function done(): void {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}
		function onAbort(): void {
			clearTimeout(timer);
			signal.removeEventListener('abort', onAbort);
			reject(abortError());
		}
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Durable adapter-facing acquisition bridge. Call enqueue as soon as a source
 * sample arrives; the local SQLite transaction completes before it is eligible
 * for network delivery.
 */
export class AcquisitionBridge {
	private readonly spool: IngestSpool;
	private readonly sendBatch: AcquisitionBridgeOptions['send'];
	private readonly batchSize: number;
	private readonly baseRetryMs: number;
	private readonly maxRetryMs: number;
	private readonly idlePollMs: number;
	private readonly now: () => number;
	private readonly onGap?: (gap: SpoolGap) => void;
	private stopped = false;
	private flushing = false;
	private runController?: AbortController;
	private inFlightController?: AbortController;

	constructor(options: AcquisitionBridgeOptions) {
		this.spool = options.spool;
		this.sendBatch = options.send;
		this.batchSize = options.batchSize ?? 256;
		this.baseRetryMs = options.baseRetryMs ?? 500;
		this.maxRetryMs = options.maxRetryMs ?? 30_000;
		this.idlePollMs = options.idlePollMs ?? 250;
		this.now = options.now ?? Date.now;
		this.onGap = options.onGap;
		if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
			throw new RangeError('batchSize must be a positive integer');
		}
		if (!Number.isFinite(this.baseRetryMs) || this.baseRetryMs < 1) {
			throw new RangeError('baseRetryMs must be positive');
		}
		if (!Number.isFinite(this.maxRetryMs) || this.maxRetryMs < this.baseRetryMs) {
			throw new RangeError('maxRetryMs must be at least baseRetryMs');
		}
		if (!Number.isFinite(this.idlePollMs) || this.idlePollMs < 1) {
			throw new RangeError('idlePollMs must be positive');
		}
	}

	enqueue(sample: TelemetrySample): EnqueueResult {
		if (this.stopped) throw new Error('Acquisition bridge is stopped');
		const result = this.spool.append(sample);
		for (const gap of result.gaps) this.onGap?.(gap);
		return result;
	}

	/** Send one ordered, bounded batch. Rejected samples stay queued for retry. */
	async flushOnce(signal?: AbortSignal): Promise<FlushResult> {
		if (this.stopped || signal?.aborted) return { status: 'aborted' };
		if (this.flushing) return { status: 'busy' };
		const rows = this.spool.readBatch(this.batchSize, this.now());
		if (rows.length === 0) return { status: 'empty' };

		this.flushing = true;
		const controller = new AbortController();
		this.inFlightController = controller;
		const combinedSignal = signal
			? AbortSignal.any([signal, controller.signal])
			: controller.signal;
		try {
			const accepted = await this.sendBatch(
				rows.map((row) => row.sample),
				combinedSignal
			);
			if (combinedSignal.aborted) return { status: 'aborted' };

			const batchIds = new Set(rows.map((row) => row.id));
			const acceptedIds = [...new Set(accepted)].filter((id) => batchIds.has(id));
			this.spool.acknowledge(acceptedIds);
			const acceptedSet = new Set(acceptedIds);
			const rejected = rows.filter((row) => !acceptedSet.has(row.id));
			if (rejected.length === 0) {
				return { status: 'sent', sent: acceptedIds.length, deferred: 0 };
			}
			const retryInMs = this.deferForRetry(rejected);
			return { status: 'sent', sent: acceptedIds.length, deferred: rejected.length, retryInMs };
		} catch (error) {
			if (combinedSignal.aborted || (error instanceof Error && error.name === 'AbortError')) {
				return { status: 'aborted' };
			}
			const retryInMs = this.deferForRetry(rows);
			return { status: 'retry', deferred: rows.length, retryInMs };
		} finally {
			this.flushing = false;
			if (this.inFlightController === controller) this.inFlightController = undefined;
		}
	}

	/** Run delivery until aborted or stop() is called; queued data remains durable. */
	async run(signal?: AbortSignal): Promise<void> {
		if (this.stopped) return;
		const controller = new AbortController();
		this.runController = controller;
		const runSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
		try {
			while (!runSignal.aborted && !this.stopped) {
				const result = await this.flushOnce(runSignal);
				if (result.status === 'aborted') break;
				const wait =
					result.status === 'retry' || (result.status === 'sent' && 'retryInMs' in result)
						? (result.retryInMs ?? this.idlePollMs)
						: this.idlePollMs;
				await sleep(wait, runSignal);
			}
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) throw error;
		} finally {
			if (this.runController === controller) this.runController = undefined;
		}
	}

	stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.runController?.abort(abortError());
		this.inFlightController?.abort(abortError());
	}

	private deferForRetry(rows: readonly QueuedIngestSample[]): number {
		const delays = rows.map((row) =>
			Math.min(this.maxRetryMs, this.baseRetryMs * 2 ** Math.min(row.attempts, 30))
		);
		const retryInMs = Math.max(...delays);
		this.spool.defer(
			rows.map((row) => row.id),
			this.now() + retryInMs
		);
		return retryInMs;
	}
}

export function createAcquisitionBridge(options: AcquisitionBridgeOptions): AcquisitionBridge {
	return new AcquisitionBridge(options);
}
