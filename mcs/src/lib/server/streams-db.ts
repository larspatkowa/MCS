import { randomUUID } from 'crypto';
import { resolve } from 'node:path';
import { getDb } from './db.js';
import * as runsDb from './runs-db.js';
import * as sourcesDb from './sources-db.js';
import { BadRequestError, ConflictError } from './errors.js';
import { MAX_BATCH_SIZE, validateSample } from './ingest-validation.js';
import type { TelemetrySample } from '../telemetry/index.js';

export function listStreams(
	projectPath: string
): { id: string; name: string; metadata?: Record<string, unknown> }[] {
	const db = getDb(projectPath);
	const rows = db.prepare('SELECT id, name, metadata FROM streams ORDER BY name').all() as {
		id: string;
		name: string;
		metadata: string;
	}[];
	return rows.map((r) => {
		let meta: Record<string, unknown> | undefined;
		if (r.metadata && r.metadata !== '{}') {
			try {
				meta = JSON.parse(r.metadata) as Record<string, unknown>;
			} catch {
				meta = undefined;
			}
		}
		return { id: r.id, name: r.name, metadata: meta };
	});
}

export function getStreamLast(
	projectPath: string,
	streamId: string
): { lastValue?: number; lastPayload?: string } | null {
	const sample = getStreamSamples(projectPath, streamId, undefined, undefined, 1).at(-1);
	if (!sample) return null;
	const { timestamp: _timestamp, ...payload } = sample;
	return { lastValue: sample.value, lastPayload: JSON.stringify(payload) };
}

function extractNumericValue(payload: Record<string, unknown>): number | undefined {
	const keys = Object.keys(payload).filter((k) => typeof payload[k] === 'number');
	if (!keys.length) return undefined;
	return payload[keys[0]] as number;
}

export interface StreamSample {
	timestamp: number;
	value: number;
	eventId?: number;
	receivedAt?: number;
	[key: string]: unknown;
}

export interface IngestSample {
	streamId: string;
	timestamp: number;
	values: Record<string, unknown>;
	kind?: runsDb.RecordedSampleKind;
	provenance?: Record<string, unknown>;
	telemetry?: IngestTelemetryMetadata;
	historyId?: number;
}

export interface IngestSamplesResult {
	/** Rows newly inserted and eligible for live notifications/run recording. */
	inserted: IngestSample[];
	/** Stable bridge IDs known to be durable, including exact retry duplicates. */
	acknowledgedIds: string[];
}

export interface IngestTelemetryMetadata {
	sourceId: string;
	sourceTimestamp: number | string;
	sourceUnit: sourcesDb.SourceTimestampUnit;
	sourceTimeSystem: string;
	sequence?: number;
	idempotencyKey?: string;
	quality?: Record<string, unknown>;
	provenance?: Record<string, unknown>;
	sourceName?: string;
}

export interface HistoricalStreamEvent {
	streamId: string;
	sourceId: string;
	timestamp: number;
	values: Record<string, unknown>;
	eventId: number;
}

/**
 * Process-local live preview. It is deliberately bounded and is never used as
 * a substitute for a finalized run. A restart clears it by design.
 */
export const LIVE_PREVIEW_LIMIT = 4_096;

type PreviewSample = IngestSample;

const livePreviewByProject = new Map<string, PreviewSample[]>();

/**
 * Return the bounded process-local preview without exposing the mutable buffer.
 * Explicit exports may include this preview, but it is never a substitute for
 * a finalized run and is still cleared when the process restarts.
 */
export function getLivePreviewSamples(projectPath: string): IngestSample[] {
	return (livePreviewByProject.get(previewKey(projectPath)) ?? []).map((sample) => ({
		streamId: sample.streamId,
		timestamp: sample.timestamp,
		values: { ...sample.values },
		...(sample.kind ? { kind: sample.kind } : {}),
		...(sample.provenance ? { provenance: { ...sample.provenance } } : {})
	}));
}

function previewKey(projectPath: string): string {
	return resolve(projectPath);
}

export function clearLivePreview(projectPath: string): void {
	livePreviewByProject.delete(previewKey(projectPath));
}

function appendLivePreview(projectPath: string, samples: IngestSample[]): void {
	if (samples.length === 0) return;
	const key = previewKey(projectPath);
	const buffer = livePreviewByProject.get(key) ?? [];
	buffer.push(...samples);
	if (buffer.length > LIVE_PREVIEW_LIMIT) buffer.splice(0, buffer.length - LIVE_PREVIEW_LIMIT);
	livePreviewByProject.set(key, buffer);
}

export function getStreamSamples(
	projectPath: string,
	streamId: string,
	from?: number,
	to?: number,
	limit?: number,
	runId?: string,
	includeEventIds = false,
	includeReceivedAt = false
): StreamSample[] {
	if (runId) return runsDb.getRunStreamSamples(projectPath, runId, streamId, from, to, limit);

	const db = getDb(projectPath);

	const clauses: string[] = ['stream_id = ?'];
	const params: unknown[] = [streamId];

	if (typeof from === 'number') {
		clauses.push('event_ts >= ?');
		params.push(from);
	}
	if (typeof to === 'number') {
		clauses.push('event_ts <= ?');
		params.push(to);
	}

	const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const limited = typeof limit === 'number' && limit > 0;
	type Row = { id: number; event_ts: number; received_at: number; payload: string };

	// A bounded window with more samples than the limit is reduced to the
	// minimum and maximum of each time bucket. Truncating instead would show
	// only the start of the window and could drop peaks such as apogee.
	if (limited && typeof from === 'number' && typeof to === 'number' && to > from) {
		const { count } = db
			.prepare(`SELECT COUNT(*) AS count FROM telemetry_history ${whereSql}`)
			.get(...params) as { count: number };
		if (count > limit) {
			const buckets = Math.max(1, Math.floor(limit / 2));
			const width = (to - from) / buckets;
			const bucketSql = (aggregate: 'MIN' | 'MAX') =>
				`SELECT id, event_ts, received_at, payload, ${aggregate}(json_extract(payload, '$.value')) AS v
				 FROM telemetry_history ${whereSql} GROUP BY CAST((event_ts - ?) / ? AS INTEGER)`;
			const rows = db
				.prepare(
					`SELECT id, event_ts, received_at, payload FROM (${bucketSql('MIN')} UNION ${bucketSql('MAX')})
					 ORDER BY event_ts, id`
				)
				.all(...params, from, width, ...params, from, width) as Row[];
			return rows.map((row) => toStreamSample(row, includeEventIds, includeReceivedAt));
		}
	}

	if (limited) params.push(limit);
	const limitSql = limited ? 'LIMIT ?' : '';

	// Unless both bounds are given, a limit means the newest samples (live
	// seeding, or the last value before a playhead). Restore chronological
	// order after the descending query.
	const newestLimitedWindow = limited && (from === undefined || to === undefined);
	const orderSql = newestLimitedWindow ? 'ORDER BY event_ts DESC' : 'ORDER BY event_ts ASC';
	const sql = `SELECT id, event_ts, received_at, payload FROM telemetry_history ${whereSql} ${orderSql}, id ${limitSql}`;
	const rows = db.prepare(sql).all(...params) as Row[];
	if (newestLimitedWindow) rows.reverse();
	return rows.map((row) => toStreamSample(row, includeEventIds, includeReceivedAt));
}

function toStreamSample(
	row: { id: number; event_ts: number; received_at: number; payload: string },
	includeEventIds: boolean,
	includeReceivedAt: boolean
): StreamSample {
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(row.payload) as Record<string, unknown>;
	} catch {
		payload = {};
	}
	const value = extractNumericValue(payload) ?? NaN;
	return {
		...payload,
		timestamp: row.event_ts,
		value,
		...(includeEventIds ? { eventId: row.id } : {}),
		...(includeReceivedAt ? { receivedAt: row.received_at } : {})
	};
}

/** Read newly ingested stream events in durable arrival order for live catch-up. */
export function getStreamSamplesAfterEventId(
	projectPath: string,
	streamId: string,
	afterEventId: number,
	limit = 2_000,
	includeReceivedAt = false
): StreamSample[] {
	const boundedLimit = Math.max(1, Math.min(10_000, Math.floor(limit)));
	const rows = getDb(projectPath)
		.prepare(
			`SELECT id,event_ts,received_at,payload FROM telemetry_history
		WHERE stream_id=? AND id>? ORDER BY id LIMIT ?`
		)
		.all(streamId, afterEventId, boundedLimit) as {
		id: number;
		event_ts: number;
		received_at: number;
		payload: string;
	}[];
	return rows.map((row) => {
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(row.payload) as Record<string, unknown>;
		} catch {
			payload = {};
		}
		return {
			...payload,
			timestamp: row.event_ts,
			value: extractNumericValue(payload) ?? Number.NaN,
			eventId: row.id,
			...(includeReceivedAt ? { receivedAt: row.received_at } : {})
		};
	});
}

/** Return the current durable SSE watermark before subscribing to new events. */
export function getLatestEventId(projectPath: string): number {
	const row = getDb(projectPath)
		.prepare('SELECT COALESCE(MAX(id),0) AS eventId FROM telemetry_history')
		.get() as { eventId: number };
	return row.eventId;
}

/** Resume durable live delivery from a globally ordered event id. */
export function getHistoryEventsAfter(
	projectPath: string,
	afterId: number,
	limit = 10_000,
	sourceId?: string
): HistoricalStreamEvent[] {
	const boundedLimit = Math.max(1, Math.min(10_000, Math.floor(limit)));
	const sourceClause = sourceId === undefined ? '' : 'AND source_id = ?';
	const params =
		sourceId === undefined
			? [Math.max(0, Math.floor(afterId)), boundedLimit]
			: [Math.max(0, Math.floor(afterId)), sourceId, boundedLimit];
	const rows = getDb(projectPath)
		.prepare(
			`SELECT id,stream_id,source_id,event_ts,payload FROM telemetry_history
			WHERE id>? ${sourceClause} ORDER BY id LIMIT ?`
		)
		.all(...params) as {
		id: number;
		stream_id: string;
		source_id: string;
		event_ts: number;
		payload: string;
	}[];
	return rows.map((row) => {
		let values: Record<string, unknown>;
		try {
			values = JSON.parse(row.payload) as Record<string, unknown>;
		} catch {
			values = {};
		}
		return {
			eventId: row.id,
			streamId: row.stream_id,
			sourceId: row.source_id,
			timestamp: row.event_ts,
			values
		};
	});
}

/** Read one durable row in the public, versioned provider shape. */
export function getTelemetrySampleById(
	projectPath: string,
	eventId: number
): TelemetrySample | null {
	const row = getDb(projectPath)
		.prepare(
			`SELECT id,stream_id,source_id,source_timestamp,source_timestamp_raw,
		source_timestamp_is_string,source_unit,source_time_system,event_ts,received_at,source_sequence,
		idempotency_key,payload,quality_json FROM telemetry_history WHERE id=?`
		)
		.get(eventId) as
		| {
				id: number;
				stream_id: string;
				source_id: string;
				source_timestamp: number;
				source_timestamp_raw: string;
				source_timestamp_is_string: number;
				source_unit: IngestTelemetryMetadata['sourceUnit'];
				source_time_system: string;
				event_ts: number;
				received_at: number;
				source_sequence: number | null;
				idempotency_key: string | null;
				payload: string;
				quality_json: string;
		  }
		| undefined;
	if (!row) return null;
	let values: Record<string, unknown> = {};
	let storedQuality: Record<string, unknown> = {};
	try {
		values = JSON.parse(row.payload) as Record<string, unknown>;
	} catch {}
	try {
		storedQuality = JSON.parse(row.quality_json) as Record<string, unknown>;
	} catch {}
	const quality =
		storedQuality.quality && typeof storedQuality.quality === 'object'
			? (storedQuality.quality as TelemetrySample['quality'])
			: (storedQuality as TelemetrySample['quality']);
	const provenance =
		storedQuality.provenance && typeof storedQuality.provenance === 'object'
			? (storedQuality.provenance as TelemetrySample['provenance'])
			: undefined;
	const rawValue = row.source_timestamp_raw || String(row.source_timestamp);
	return {
		version: 1,
		sourceId: row.source_id,
		streamId: row.stream_id,
		sourceTimestamp: {
			value: row.source_timestamp_is_string ? rawValue : Number(rawValue),
			unit: row.source_unit,
			timeSystem: row.source_time_system
		},
		receivedAt: row.received_at,
		eventTimeUtc: row.event_ts,
		...(row.source_sequence === null ? {} : { sequence: row.source_sequence }),
		...(row.idempotency_key === null ? {} : { idempotencyKey: row.idempotency_key }),
		values: values as TelemetrySample['values'],
		...(quality && Object.keys(quality).length ? { quality } : {}),
		...(provenance && Object.keys(provenance).length ? { provenance } : {})
	};
}

/** Delete one bounded batch of expired continuous history; saved-run chunks are separate. */
export function purgeExpiredHistory(
	projectPath: string,
	receivedBefore: number,
	batchSize = 5_000
): number {
	const limit = Math.max(1, Math.min(10_000, Math.floor(batchSize)));
	return getDb(projectPath)
		.prepare(
			`DELETE FROM telemetry_history WHERE id IN (
		SELECT id FROM telemetry_history WHERE received_at < ? ORDER BY received_at,id LIMIT ?
	)`
		)
		.run(receivedBefore, limit).changes;
}

export function ensureStream(projectPath: string, streamId: string, name?: string): void {
	const db = getDb(projectPath);
	const existing = db.prepare('SELECT id FROM streams WHERE id = ?').get(streamId);
	if (existing) return;
	const now = new Date().toISOString();
	db.prepare('INSERT INTO streams (id, name, metadata, created_at) VALUES (?, ?, ?, ?)').run(
		streamId,
		name ?? streamId,
		'{}',
		now
	);
}

export function updateStreamMetadata(
	projectPath: string,
	streamId: string,
	metadata: Record<string, unknown>,
	name?: string
): void {
	const db = getDb(projectPath);
	const now = new Date().toISOString();
	// Ensure stream exists first
	ensureStream(projectPath, streamId, name);
	const row = db.prepare('SELECT name, metadata FROM streams WHERE id = ?').get(streamId) as
		{ name: string; metadata: string } | undefined;

	const currentName = row?.name ?? streamId;
	let currentMetadata: Record<string, unknown> = {};
	if (row?.metadata) {
		try {
			currentMetadata = JSON.parse(row.metadata) as Record<string, unknown>;
		} catch {
			currentMetadata = {};
		}
	}

	const nextName = name ?? currentName;
	const nextMetadata = { ...currentMetadata, ...metadata };

	db.prepare(
		'UPDATE streams SET name = ?, metadata = ?, created_at = COALESCE(created_at, ?) WHERE id = ?'
	).run(nextName, JSON.stringify(nextMetadata), now, streamId);
}

/** Insert one acquisition batch in a single SQLite transaction. */
export function ingestSamples(
	projectPath: string,
	samples: IngestSample[],
	options: { runId?: string } = {}
): IngestSample[] {
	return ingestSamplesDetailed(projectPath, samples, options).inserted;
}

/** Insert a batch and return stable ids safe for an acquisition bridge to acknowledge. */
export function ingestSamplesDetailed(
	projectPath: string,
	samples: IngestSample[],
	options: { runId?: string } = {}
): IngestSamplesResult {
	if (samples.length === 0) return { inserted: [], acknowledgedIds: [] };
	if (samples.length > MAX_BATCH_SIZE) {
		throw new BadRequestError(`samples may contain at most ${MAX_BATCH_SIZE} items`);
	}
	const validatedSamples = samples.map((sample) => {
		const validated = validateSample(sample);
		return { ...sample, ...validated };
	});
	const db = getDb(projectPath);
	const now = new Date().toISOString();
	const ensure = db.prepare(
		'INSERT OR IGNORE INTO streams (id, name, metadata, created_at) VALUES (?, ?, ?, ?)'
	);
	const insertSource = db.prepare(`INSERT OR IGNORE INTO telemetry_sources
		(id,name,time_system,timestamp_unit,created_at,updated_at) VALUES (?,?,?,?,?,?)`);
	const insertHistory = db.prepare(`INSERT OR IGNORE INTO telemetry_history
		(stream_id,source_id,source_timestamp,source_timestamp_raw,source_timestamp_is_string,source_unit,source_time_system,
		event_ts,received_at,source_sequence,idempotency_key,payload,quality_json,run_id)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
	const getSequence = db.prepare(
		'SELECT max_sequence FROM source_stream_sequences WHERE source_id=? AND stream_id=?'
	);
	const findBySequence =
		db.prepare(`SELECT id,source_timestamp,source_timestamp_raw,source_unit,source_time_system,event_ts,
		source_sequence,idempotency_key,payload FROM telemetry_history WHERE source_id=? AND stream_id=? AND source_sequence=?`);
	const findByIdempotencyKey =
		db.prepare(`SELECT id,stream_id,source_timestamp,source_timestamp_raw,source_unit,source_time_system,event_ts,
		source_sequence,idempotency_key,payload FROM telemetry_history WHERE source_id=? AND idempotency_key=?`);
	const saveSequence =
		db.prepare(`INSERT INTO source_stream_sequences (source_id,stream_id,max_sequence) VALUES (?,?,?)
		ON CONFLICT(source_id,stream_id) DO UPDATE SET max_sequence=MAX(max_sequence,excluded.max_sequence)`);
	const insertGap =
		db.prepare(`INSERT INTO telemetry_gaps (id,source_id,stream_id,first_missing_sequence,last_missing_sequence,detected_at)
		VALUES (?,?,?,?,?,?)`);
	const openGaps =
		db.prepare(`SELECT id,first_missing_sequence,last_missing_sequence FROM telemetry_gaps
		WHERE source_id=? AND stream_id=? AND resolved_at IS NULL AND first_missing_sequence<=? AND last_missing_sequence>=?`);
	const updateGapStart = db.prepare(
		'UPDATE telemetry_gaps SET first_missing_sequence=? WHERE id=?'
	);
	const updateGapEnd = db.prepare('UPDATE telemetry_gaps SET last_missing_sequence=? WHERE id=?');
	const resolveGap = db.prepare('UPDATE telemetry_gaps SET resolved_at=? WHERE id=?');
	const splitGap = db.prepare(`UPDATE telemetry_gaps SET last_missing_sequence=? WHERE id=?`);
	const updateSourceStatus =
		db.prepare(`UPDATE telemetry_sources SET last_received_at=?,last_event_at=MAX(COALESCE(last_event_at,?),?),
		last_sequence=CASE WHEN ? IS NULL THEN last_sequence ELSE MAX(COALESCE(last_sequence,?),?) END,
		missing_sequence_count=MAX(0,missing_sequence_count+?),updated_at=? WHERE id=?`);
	const accepted = db.transaction((records: IngestSample[]): IngestSamplesResult => {
		const streamIds = new Set<string>();
		for (const sample of records) {
			if (!streamIds.has(sample.streamId)) {
				ensure.run(sample.streamId, sample.streamId, '{}', now);
				streamIds.add(sample.streamId);
			}
		}
		const inserted: IngestSample[] = [];
		const acknowledgedIds: string[] = [];
		for (const sample of records) {
			const telemetry = sample.telemetry ?? {
				sourceId: 'legacy',
				sourceTimestamp: sample.timestamp,
				sourceUnit: 'seconds' as const,
				sourceTimeSystem: 'unix-utc',
				quality: { clockQuality: 'unknown', compatibility: true }
			};
			if (
				telemetry.sequence !== undefined &&
				(!Number.isSafeInteger(telemetry.sequence) || telemetry.sequence < 0)
			) {
				throw new BadRequestError('sequence must be a non-negative safe integer');
			}
			const receivedAt = Date.now() / 1000;
			insertSource.run(
				telemetry.sourceId,
				telemetry.sourceName ?? telemetry.sourceId,
				telemetry.sourceTimeSystem,
				telemetry.sourceUnit,
				now,
				now
			);
			const previous =
				telemetry.sequence === undefined
					? undefined
					: (getSequence.get(telemetry.sourceId, sample.streamId) as
							{ max_sequence: number } | undefined);
			const quality = JSON.stringify({
				quality: telemetry.quality ?? {},
				provenance: telemetry.provenance ?? {}
			});
			const result = insertHistory.run(
				sample.streamId,
				telemetry.sourceId,
				telemetry.sourceTimestamp,
				String(telemetry.sourceTimestamp),
				typeof telemetry.sourceTimestamp === 'string' ? 1 : 0,
				telemetry.sourceUnit,
				telemetry.sourceTimeSystem,
				sample.timestamp,
				receivedAt,
				telemetry.sequence ?? null,
				telemetry.idempotencyKey ?? null,
				JSON.stringify(sample.values),
				quality,
				options.runId ?? null
			);
			if (result.changes === 0) {
				const bySequence =
					telemetry.sequence === undefined
						? undefined
						: (findBySequence.get(telemetry.sourceId, sample.streamId, telemetry.sequence) as
								| {
										id: number;
										source_timestamp: number;
										source_timestamp_raw: string;
										source_unit: string;
										source_time_system: string;
										event_ts: number;
										source_sequence: number | null;
										idempotency_key: string | null;
										payload: string;
								  }
								| undefined);
				const byIdempotency =
					telemetry.idempotencyKey === undefined
						? undefined
						: (findByIdempotencyKey.get(telemetry.sourceId, telemetry.idempotencyKey) as
								| {
										id: number;
										stream_id: string;
										source_timestamp: number;
										source_timestamp_raw: string;
										source_unit: string;
										source_time_system: string;
										event_ts: number;
										source_sequence: number | null;
										idempotency_key: string | null;
										payload: string;
								  }
								| undefined);
				if (bySequence && byIdempotency && bySequence.id !== byIdempotency.id) {
					throw new ConflictError(
						'Sequence and idempotency key identify different telemetry samples'
					);
				}
				const existing = byIdempotency ?? bySequence;
				if (!existing)
					throw new ConflictError('Telemetry identity conflicts with an existing sample');
				const existingStreamId = 'stream_id' in existing ? existing.stream_id : sample.streamId;
				const isExactRetry =
					existingStreamId === sample.streamId &&
					existing.source_timestamp_raw === String(telemetry.sourceTimestamp) &&
					existing.source_unit === telemetry.sourceUnit &&
					existing.source_time_system === telemetry.sourceTimeSystem &&
					existing.source_sequence === (telemetry.sequence ?? null) &&
					existing.payload === JSON.stringify(sample.values);
				if (!isExactRetry)
					throw new ConflictError('Telemetry identity was reused with different sample data');
				updateSourceStatus.run(
					receivedAt,
					sample.timestamp,
					sample.timestamp,
					telemetry.sequence ?? null,
					telemetry.sequence ?? null,
					telemetry.sequence ?? null,
					0,
					now,
					telemetry.sourceId
				);
				if (telemetry.idempotencyKey) acknowledgedIds.push(telemetry.idempotencyKey);
				continue;
			}
			if (telemetry.idempotencyKey) acknowledgedIds.push(telemetry.idempotencyKey);
			let gapDelta = 0;
			if (telemetry.sequence !== undefined) {
				const sequence = telemetry.sequence;
				if (previous && sequence > previous.max_sequence + 1) {
					const firstMissing = previous.max_sequence + 1;
					const lastMissing = sequence - 1;
					insertGap.run(
						randomUUID(),
						telemetry.sourceId,
						sample.streamId,
						firstMissing,
						lastMissing,
						receivedAt
					);
					gapDelta += lastMissing - firstMissing + 1;
				} else if (previous && sequence <= previous.max_sequence) {
					const matches = openGaps.all(telemetry.sourceId, sample.streamId, sequence, sequence) as {
						id: string;
						first_missing_sequence: number;
						last_missing_sequence: number;
					}[];
					for (const gap of matches) {
						if (gap.first_missing_sequence === sequence && gap.last_missing_sequence === sequence) {
							resolveGap.run(receivedAt, gap.id);
						} else if (gap.first_missing_sequence === sequence) {
							updateGapStart.run(sequence + 1, gap.id);
						} else if (gap.last_missing_sequence === sequence) {
							updateGapEnd.run(sequence - 1, gap.id);
						} else {
							splitGap.run(sequence - 1, gap.id);
							insertGap.run(
								randomUUID(),
								telemetry.sourceId,
								sample.streamId,
								sequence + 1,
								gap.last_missing_sequence,
								receivedAt
							);
						}
						gapDelta -= 1;
					}
				}
				if (!previous || sequence > previous.max_sequence)
					saveSequence.run(telemetry.sourceId, sample.streamId, sequence);
			}
			updateSourceStatus.run(
				receivedAt,
				sample.timestamp,
				sample.timestamp,
				telemetry.sequence ?? null,
				telemetry.sequence ?? null,
				telemetry.sequence ?? null,
				gapDelta,
				now,
				telemetry.sourceId
			);
			inserted.push({ ...sample, historyId: Number(result.lastInsertRowid) });
		}
		return { inserted, acknowledgedIds };
	})(validatedSamples);
	if (options.runId) runsDb.appendRunSamples(projectPath, options.runId, accepted.inserted);
	appendLivePreview(projectPath, accepted.inserted);
	return accepted;
}

export function listAnnotations(
	projectPath: string,
	from: number,
	to: number,
	runId?: string,
	limit = 10_000
): { id: string; runId: string | null; ts: number; label: string; details: string }[] {
	const db = getDb(projectPath);
	const clauses = ['ts >= ?', 'ts <= ?'];
	const params: unknown[] = [from, to];
	if (runId) {
		clauses.push('run_id = ?');
		params.push(runId);
	}
	const rows = db
		.prepare(
			`SELECT id, run_id, ts, label, details FROM annotations
			 WHERE ${clauses.join(' AND ')} ORDER BY ts, rowid LIMIT ?`
		)
		.all(...params, Math.max(1, Math.min(10_000, Math.floor(limit)))) as {
		id: string;
		run_id: string | null;
		ts: number;
		label: string;
		details: string;
	}[];
	return rows.map((row) => ({
		id: row.id,
		runId: row.run_id,
		ts: row.ts,
		label: row.label,
		details: row.details
	}));
}

export function createAnnotation(
	projectPath: string,
	ts: number,
	label: string,
	details?: string,
	runId?: string | null
): { id: string; runId: string | null } {
	const db = getDb(projectPath);
	const id = randomUUID();
	const now = new Date().toISOString();
	db.prepare(
		'INSERT INTO annotations (id, run_id, ts, label, details, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(id, runId ?? null, ts, label, details ?? '', now);
	return { id, runId: runId ?? null };
}

export function deleteAnnotation(projectPath: string, annotationId: string): boolean {
	const db = getDb(projectPath);
	const result = db.prepare('DELETE FROM annotations WHERE id = ?').run(annotationId);
	return result.changes > 0;
}
