import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import type { TelemetrySample } from '../telemetry/index.js';

export interface IngestSpoolOptions {
	filename: string;
	maxQueuedSamples?: number;
	maxQueuedBytes?: number;
	clock?: () => number;
}

export interface QueuedIngestSample {
	id: string;
	sample: TelemetrySample;
	attempts: number;
	nextAttemptAt: number;
}

export interface SpoolGap {
	sourceId: string;
	streamId: string;
	firstMissingSequence?: number;
	lastMissingSequence?: number;
	observedAt: number;
	reason: 'sequence-gap' | 'buffer-overflow';
}

export type EnqueueResult =
	{ queued: true; id: string; gaps: SpoolGap[] } | { queued: false; gaps: SpoolGap[] };

const DEFAULT_MAX_QUEUED_SAMPLES = 100_000;
const DEFAULT_MAX_QUEUED_BYTES = 256 * 1024 * 1024;

/** Durable, bounded SQLite queue for telemetry accepted from acquisition adapters. */
export class IngestSpool {
	private readonly db: Database.Database;
	private readonly maxQueuedSamples: number;
	private readonly maxQueuedBytes: number;
	private readonly clock: () => number;
	private closed = false;

	constructor(options: IngestSpoolOptions) {
		if (!options.filename) throw new TypeError('filename is required');
		this.maxQueuedSamples = options.maxQueuedSamples ?? DEFAULT_MAX_QUEUED_SAMPLES;
		this.maxQueuedBytes = options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
		if (!Number.isInteger(this.maxQueuedSamples) || this.maxQueuedSamples < 1) {
			throw new RangeError('maxQueuedSamples must be a positive integer');
		}
		if (!Number.isInteger(this.maxQueuedBytes) || this.maxQueuedBytes < 1) {
			throw new RangeError('maxQueuedBytes must be a positive integer');
		}
		this.clock = options.clock ?? Date.now;
		this.db = new Database(options.filename);
		chmodSync(options.filename, 0o600);
		this.db.pragma('journal_mode = WAL');
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS ingest_spool (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				envelope_id TEXT NOT NULL UNIQUE,
				payload TEXT NOT NULL,
				payload_bytes INTEGER NOT NULL,
				attempts INTEGER NOT NULL DEFAULT 0,
				next_attempt_at INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE IF NOT EXISTS ingest_spool_sequences (
				source_id TEXT NOT NULL,
				stream_id TEXT NOT NULL,
				last_sequence INTEGER NOT NULL,
				PRIMARY KEY (source_id, stream_id)
			);
		`);
	}

	/** Persist before returning success. A full spool returns an explicit gap. */
	append(input: TelemetrySample): EnqueueResult {
		this.assertOpen();
		const id = input.idempotencyKey || randomUUID();
		const sample: TelemetrySample = { ...input, idempotencyKey: id };
		const payload = JSON.stringify(sample);
		const payloadBytes = Buffer.byteLength(payload, 'utf8');
		const observedAt = this.clock() / 1000;
		const gaps: SpoolGap[] = [];

		const appendTransaction = this.db.transaction((): EnqueueResult => {
			const duplicate = this.db
				.prepare('SELECT payload FROM ingest_spool WHERE envelope_id = ?')
				.get(id);
			if (duplicate) {
				if ((duplicate as { payload: string }).payload !== payload) {
					throw new Error('Idempotency key was reused with different telemetry');
				}
				return { queued: true, id, gaps };
			}

			if (sample.sequence !== undefined) {
				const previous = this.db
					.prepare(
						'SELECT last_sequence AS sequence FROM ingest_spool_sequences WHERE source_id = ? AND stream_id = ?'
					)
					.get(sample.sourceId, sample.streamId) as { sequence: number } | undefined;
				if (previous && sample.sequence > previous.sequence + 1) {
					gaps.push({
						sourceId: sample.sourceId,
						streamId: sample.streamId,
						firstMissingSequence: previous.sequence + 1,
						lastMissingSequence: sample.sequence - 1,
						observedAt,
						reason: 'sequence-gap'
					});
				}
				if (!previous || sample.sequence > previous.sequence) {
					this.db
						.prepare(
							`INSERT INTO ingest_spool_sequences (source_id, stream_id, last_sequence)
							 VALUES (?, ?, ?)
							 ON CONFLICT(source_id, stream_id) DO UPDATE SET last_sequence = excluded.last_sequence`
						)
						.run(sample.sourceId, sample.streamId, sample.sequence);
				}
			}

			const capacity = this.db
				.prepare(
					'SELECT COUNT(*) AS count, COALESCE(SUM(payload_bytes), 0) AS bytes FROM ingest_spool'
				)
				.get() as { count: number; bytes: number };
			if (
				payloadBytes > this.maxQueuedBytes ||
				capacity.count >= this.maxQueuedSamples ||
				capacity.bytes + payloadBytes > this.maxQueuedBytes
			) {
				gaps.push({
					sourceId: sample.sourceId,
					streamId: sample.streamId,
					...(sample.sequence === undefined
						? {}
						: {
								firstMissingSequence: sample.sequence,
								lastMissingSequence: sample.sequence
							}),
					observedAt,
					reason: 'buffer-overflow'
				});
				return { queued: false, gaps };
			}

			this.db
				.prepare('INSERT INTO ingest_spool (envelope_id, payload, payload_bytes) VALUES (?, ?, ?)')
				.run(id, payload, payloadBytes);
			return { queued: true, id, gaps };
		});

		return appendTransaction();
	}

	readBatch(limit: number, now = this.clock()): QueuedIngestSample[] {
		this.assertOpen();
		if (!Number.isInteger(limit) || limit < 1)
			throw new RangeError('limit must be a positive integer');
		const rows = (
			this.db
				.prepare(
					`SELECT envelope_id AS id, payload, attempts, next_attempt_at AS nextAttemptAt
					 FROM ingest_spool ORDER BY ingest_spool.id LIMIT ?`
				)
				.all(limit) as {
				id: string;
				payload: string;
				attempts: number;
				nextAttemptAt: number;
			}[]
		).map((row) => ({
			id: row.id,
			sample: JSON.parse(row.payload) as TelemetrySample,
			attempts: row.attempts,
			nextAttemptAt: row.nextAttemptAt
		}));
		// Do not send newer records while an earlier record is still backing off.
		return rows.length > 0 && rows.some((row) => row.nextAttemptAt > now) ? [] : rows;
	}

	/** Delete exactly the IDs the server reported accepted. */
	acknowledge(acceptedIds: readonly string[]): number {
		this.assertOpen();
		if (acceptedIds.length === 0) return 0;
		const remove = this.db.prepare('DELETE FROM ingest_spool WHERE envelope_id = ?');
		const acknowledgeTransaction = this.db.transaction((ids: readonly string[]) =>
			ids.reduce((deleted, id) => deleted + remove.run(id).changes, 0)
		);
		return acknowledgeTransaction([...new Set(acceptedIds)]);
	}

	defer(ids: readonly string[], nextAttemptAt: number): void {
		this.assertOpen();
		if (!Number.isFinite(nextAttemptAt)) throw new RangeError('nextAttemptAt must be finite');
		const update = this.db.prepare(
			'UPDATE ingest_spool SET attempts = attempts + 1, next_attempt_at = ? WHERE envelope_id = ?'
		);
		const deferTransaction = this.db.transaction((sampleIds: readonly string[]) => {
			for (const id of sampleIds) update.run(nextAttemptAt, id);
		});
		deferTransaction([...new Set(ids)]);
	}

	get size(): number {
		this.assertOpen();
		return (
			this.db.prepare('SELECT COUNT(*) AS count FROM ingest_spool').get() as { count: number }
		).count;
	}

	close(): void {
		if (this.closed) return;
		this.db.close();
		this.closed = true;
	}

	private assertOpen(): void {
		if (this.closed) throw new Error('ingest spool is closed');
	}
}
