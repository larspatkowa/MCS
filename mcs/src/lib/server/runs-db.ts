import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { BadRequestError, ConflictError, NotFoundError } from './errors.js';
import { getDb } from './db.js';

export type RunStatus = 'recording' | 'paused' | 'finalized';
export type RecordedSampleKind = 'raw' | 'derived';

export interface Run {
	id: string;
	status: RunStatus;
	startedAt: number;
	endedAt: number | null;
	pausedAt: number | null;
	resumedAt: number | null;
	sampleCount: number;
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface RecordedSample {
	streamId: string;
	timestamp: number;
	values: Record<string, unknown>;
	kind?: RecordedSampleKind;
	provenance?: Record<string, unknown>;
}

export interface ReplaySample {
	timestamp: number;
	value: number;
	kind: RecordedSampleKind;
	[key: string]: unknown;
}

export interface ReplaySeries {
	streamId: string;
	kind: RecordedSampleKind;
	data: ReplaySample[];
}

export interface ReplayEvent {
	streamId: string;
	kind: RecordedSampleKind;
	timestamp: number;
	values: Record<string, unknown>;
}

export interface ReplayEventPage {
	run: Run;
	events: ReplayEvent[];
	nextCursor: string | null;
	hasMore: boolean;
}

export interface RunHealthMetric {
	id: string;
	runId: string;
	ts: number;
	metric: string;
	value: number | null;
	details: Record<string, unknown>;
	createdAt: string;
}

const CHUNK_SIZE = 512;
const DEFAULT_REPLAY_LIMIT = 2_000;
const MAX_REPLAY_LIMIT = 10_000;

interface RunRow {
	id: string;
	status: RunStatus;
	started_at: number;
	ended_at: number | null;
	paused_at: number | null;
	resumed_at: number | null;
	sample_count: number;
	metadata: string;
	created_at: string;
	updated_at: string;
}

function parseObject(value: string | null | undefined): Record<string, unknown> {
	if (!value) return {};
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function toRun(row: RunRow): Run {
	return {
		id: row.id,
		status: row.status,
		startedAt: row.started_at,
		endedAt: row.ended_at,
		pausedAt: row.paused_at,
		resumedAt: row.resumed_at,
		sampleCount: row.sample_count,
		metadata: parseObject(row.metadata),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function requireRun(db: Database.Database, runId: string): RunRow {
	const row = db
		.prepare(
			`SELECT id, status, started_at, ended_at, paused_at, resumed_at,
				sample_count, metadata, created_at, updated_at
			 FROM runs WHERE id = ?`
		)
		.get(runId) as RunRow | undefined;
	if (!row) throw new NotFoundError('Run not found');
	return row;
}

function activeRunRow(db: Database.Database): RunRow | undefined {
	return db
		.prepare(
			`SELECT id, status, started_at, ended_at, paused_at, resumed_at,
				sample_count, metadata, created_at, updated_at
			 FROM runs WHERE status IN ('recording', 'paused') ORDER BY started_at DESC LIMIT 1`
		)
		.get() as RunRow | undefined;
}

function assertFiniteTimestamp(timestamp: number): void {
	if (!Number.isFinite(timestamp)) throw new BadRequestError('Run timestamp must be finite');
}

export function getActiveRun(projectPath: string): Run | null {
	const row = activeRunRow(getDb(projectPath));
	return row ? toRun(row) : null;
}

export function getRun(projectPath: string, runId: string): Run {
	return toRun(requireRun(getDb(projectPath), runId));
}

export function listRuns(projectPath: string, limit = 50): Run[] {
	const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)));
	const rows = getDb(projectPath)
		.prepare(
			`SELECT id, status, started_at, ended_at, paused_at, resumed_at,
				sample_count, metadata, created_at, updated_at
			 FROM runs ORDER BY started_at DESC LIMIT ?`
		)
		.all(boundedLimit) as RunRow[];
	return rows.map(toRun);
}

export function startRun(projectPath: string, metadata: Record<string, unknown> = {}): Run {
	const db = getDb(projectPath);
	const id = randomUUID();
	const nowSeconds = Date.now() / 1000;
	const now = new Date().toISOString();
	db.transaction(() => {
		if (activeRunRow(db))
			throw new ConflictError('Finish or pause the current run before starting another');
		db.prepare(
			`INSERT INTO runs
				(id, status, started_at, sample_count, metadata, created_at, updated_at)
			 VALUES (?, 'recording', ?, 0, ?, ?, ?)`
		).run(id, nowSeconds, JSON.stringify(metadata), now, now);
	})();
	return getRun(projectPath, id);
}

export function pauseRun(projectPath: string, runId: string): Run {
	const db = getDb(projectPath);
	const row = requireRun(db, runId);
	if (row.status !== 'recording') {
		throw new ConflictError(`Run is ${row.status}; only a recording run can be paused`);
	}
	const nowSeconds = Date.now() / 1000;
	const now = new Date().toISOString();
	db.prepare(
		`UPDATE runs SET status = 'paused', paused_at = ?, updated_at = ?
		 WHERE id = ? AND status = 'recording'`
	).run(nowSeconds, now, runId);
	return getRun(projectPath, runId);
}

export function resumeRun(projectPath: string, runId: string): Run {
	const db = getDb(projectPath);
	const row = requireRun(db, runId);
	if (row.status !== 'paused') {
		throw new ConflictError(`Run is ${row.status}; only a paused run can be resumed`);
	}
	const nowSeconds = Date.now() / 1000;
	const now = new Date().toISOString();
	db.prepare(
		`UPDATE runs SET status = 'recording', resumed_at = ?, updated_at = ?
		 WHERE id = ? AND status = 'paused'`
	).run(nowSeconds, now, runId);
	return getRun(projectPath, runId);
}

export function stopRun(projectPath: string, runId: string): Run {
	const db = getDb(projectPath);
	const row = requireRun(db, runId);
	if (row.status === 'finalized') {
		throw new ConflictError('Run is already finalized');
	}
	const nowSeconds = Date.now() / 1000;
	const now = new Date().toISOString();
	db.prepare(
		`UPDATE runs SET status = 'finalized', ended_at = ?, updated_at = ?
		 WHERE id = ? AND status IN ('recording', 'paused')`
	).run(nowSeconds, now, runId);
	return getRun(projectPath, runId);
}

/** Remove an unfinished run after an import or acquisition transaction fails. */
export function discardRun(projectPath: string, runId: string): void {
	const db = getDb(projectPath);
	const row = requireRun(db, runId);
	if (row.status === 'finalized') throw new ConflictError('A finalized run cannot be discarded');
	db.prepare("DELETE FROM runs WHERE id = ? AND status IN ('recording', 'paused')").run(runId);
}

function encodeChunk(samples: RecordedSample[]): Buffer {
	return Buffer.from(
		JSON.stringify(
			samples.map((sample) => ({ timestamp: sample.timestamp, values: sample.values }))
		),
		'utf8'
	);
}

function chunkMetadata(samples: RecordedSample[]): Record<string, unknown> {
	const first = samples.find((sample) => sample.provenance);
	return first?.provenance ?? {};
}

/** Append a recording batch as bounded chunks. */
export function appendRunSamples(
	projectPath: string,
	runId: string,
	samples: RecordedSample[]
): void {
	if (samples.length === 0) return;
	const db = getDb(projectPath);
	const grouped = new Map<string, RecordedSample[]>();
	for (const sample of samples) {
		if (!sample.streamId.trim()) throw new BadRequestError('Recorded sample streamId is required');
		assertFiniteTimestamp(sample.timestamp);
		const kind = sample.kind ?? 'raw';
		const key = `${sample.streamId}\u0000${kind}`;
		const group = grouped.get(key);
		if (group) group.push(sample);
		else grouped.set(key, [sample]);
	}

	const write = db.transaction(() => {
		const run = requireRun(db, runId);
		if (run.status !== 'recording') throw new ConflictError('Run is not recording');
		const nextSequence = db.prepare(
			`SELECT COALESCE(MAX(sequence), -1) AS sequence
			 FROM telemetry_chunks WHERE run_id = ? AND stream_id = ? AND kind = ?`
		);
		const insert = db.prepare(
			`INSERT INTO telemetry_chunks
				(id, run_id, stream_id, kind, sequence, start_ts, end_ts, sample_count,
				 encoding, payload, metadata, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'json-v1', ?, ?, ?)`
		);
		let storedCount = 0;
		const now = new Date().toISOString();

		for (const [key, group] of grouped) {
			const separator = key.indexOf('\u0000');
			const streamId = key.slice(0, separator);
			const kind = key.slice(separator + 1) as RecordedSampleKind;
			const sequenceRow = nextSequence.get(runId, streamId, kind) as { sequence: number };
			let sequence = Number(sequenceRow.sequence) + 1;
			for (let offset = 0; offset < group.length; offset += CHUNK_SIZE) {
				const chunk = group.slice(offset, offset + CHUNK_SIZE);
				const timestamps = chunk.map((sample) => sample.timestamp);
				insert.run(
					randomUUID(),
					runId,
					streamId,
					kind,
					sequence,
					Math.min(...timestamps),
					Math.max(...timestamps),
					chunk.length,
					encodeChunk(chunk),
					JSON.stringify(chunkMetadata(chunk)),
					now
				);
				sequence += 1;
				storedCount += chunk.length;
			}
		}
		db.prepare('UPDATE runs SET sample_count = sample_count + ?, updated_at = ? WHERE id = ?').run(
			storedCount,
			now,
			runId
		);
	});
	write();
}

/** Return the streams that have recorded chunks for one run. */
export function listRunStreamIds(projectPath: string, runId: string): string[] {
	const db = getDb(projectPath);
	requireRun(db, runId);
	return (
		db
			.prepare(
				'SELECT DISTINCT stream_id FROM telemetry_chunks WHERE run_id = ? ORDER BY stream_id'
			)
			.all(runId) as { stream_id: string }[]
	).map((row) => row.stream_id);
}

function decodeChunk(payload: unknown): { timestamp: number; values: Record<string, unknown> }[] {
	let text: string;
	if (Buffer.isBuffer(payload)) text = payload.toString('utf8');
	else if (payload instanceof Uint8Array) text = Buffer.from(payload).toString('utf8');
	else text = String(payload ?? '');
	try {
		const parsed: unknown = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is { timestamp: number; values: Record<string, unknown> } =>
				Boolean(item) &&
				typeof item === 'object' &&
				typeof (item as { timestamp?: unknown }).timestamp === 'number' &&
				Number.isFinite((item as { timestamp: number }).timestamp) &&
				Boolean((item as { values?: unknown }).values) &&
				typeof (item as { values: unknown }).values === 'object'
		);
	} catch {
		return [];
	}
}

function encodeReplayCursor(timestamp: number, ordinal: number): string {
	return Buffer.from(JSON.stringify({ timestamp, ordinal }), 'utf8').toString('base64url');
}

function decodeReplayCursor(
	cursor: string | undefined
): { timestamp: number; ordinal: number } | null {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
			timestamp?: unknown;
			ordinal?: unknown;
		};
		if (
			typeof parsed.timestamp !== 'number' ||
			!Number.isFinite(parsed.timestamp) ||
			typeof parsed.ordinal !== 'number' ||
			!Number.isInteger(parsed.ordinal) ||
			parsed.ordinal < 0
		)
			return null;
		return { timestamp: parsed.timestamp, ordinal: parsed.ordinal };
	} catch {
		return null;
	}
}

/**
 * Read recorded samples without visualization downsampling. The page is
 * bounded for transport safety, and the opaque cursor keeps equal timestamps
 * from being skipped when a high-rate device emits them.
 */
export function getRunEventPage(
	projectPath: string,
	runId: string,
	options: {
		from?: number;
		to?: number;
		streamId?: string;
		kind?: RecordedSampleKind;
		limit?: number;
		cursor?: string;
	} = {}
): ReplayEventPage {
	const db = getDb(projectPath);
	const run = toRun(requireRun(db, runId));
	const requestedLimit = options.limit ?? 50_000;
	const limit = Math.max(1, Math.min(250_000, Math.floor(requestedLimit)));
	const clauses = ['run_id = ?'];
	const params: unknown[] = [runId];
	if (options.from !== undefined) {
		assertFiniteTimestamp(options.from);
		clauses.push('end_ts >= ?');
		params.push(options.from);
	}
	if (options.to !== undefined) {
		assertFiniteTimestamp(options.to);
		clauses.push('start_ts <= ?');
		params.push(options.to);
	}
	if (options.streamId) {
		clauses.push('stream_id = ?');
		params.push(options.streamId);
	}
	if (options.kind) {
		clauses.push('kind = ?');
		params.push(options.kind);
	}
	const rows = db
		.prepare(
			`SELECT stream_id, kind, sequence, payload
			 FROM telemetry_chunks WHERE ${clauses.join(' AND ')}
			 ORDER BY stream_id, kind, sequence`
		)
		.all(...params) as {
		stream_id: string;
		kind: RecordedSampleKind;
		sequence: number;
		payload: unknown;
	}[];

	const events: ReplayEvent[] = [];
	for (const row of rows) {
		for (const item of decodeChunk(row.payload)) {
			if (options.from !== undefined && item.timestamp < options.from) continue;
			if (options.to !== undefined && item.timestamp > options.to) continue;
			events.push({
				streamId: row.stream_id,
				kind: row.kind,
				timestamp: item.timestamp,
				values: item.values
			});
		}
	}
	events.sort(
		(a, b) =>
			a.timestamp - b.timestamp ||
			a.streamId.localeCompare(b.streamId) ||
			a.kind.localeCompare(b.kind)
	);
	const cursor = decodeReplayCursor(options.cursor);
	const start = cursor
		? events.findIndex(
				(event, index) =>
					event.timestamp > cursor.timestamp ||
					(event.timestamp === cursor.timestamp && index > cursor.ordinal)
			)
		: 0;
	const safeStart = start < 0 ? events.length : start;
	const page = events.slice(safeStart, safeStart + limit);
	const hasMore = safeStart + page.length < events.length;
	const lastOrdinal = safeStart + page.length - 1;
	return {
		run,
		events: page,
		hasMore,
		nextCursor:
			hasMore && page.length > 0
				? encodeReplayCursor(page[page.length - 1].timestamp, lastOrdinal)
				: null
	};
}

function firstNumericValue(values: Record<string, unknown>): number {
	const value = Object.values(values).find((candidate) => typeof candidate === 'number');
	return typeof value === 'number' ? value : Number.NaN;
}

function downsamplePeaks(samples: ReplaySample[], maxPoints: number): ReplaySample[] {
	if (samples.length <= maxPoints) return samples;
	if (maxPoints < 3) return [samples[0], samples[samples.length - 1]].slice(0, maxPoints);

	const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
	const result: ReplaySample[] = [samples[0]];
	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = 1 + Math.floor((bucket * (samples.length - 2)) / bucketCount);
		const end = Math.max(
			start + 1,
			1 + Math.floor(((bucket + 1) * (samples.length - 2)) / bucketCount)
		);
		const candidates = samples.slice(start, Math.min(samples.length - 1, end));
		if (candidates.length === 0) continue;
		let min = candidates[0];
		let max = candidates[0];
		for (const candidate of candidates.slice(1)) {
			if (candidate.value < min.value) min = candidate;
			if (candidate.value > max.value) max = candidate;
		}
		if (min.timestamp <= max.timestamp) result.push(min, max);
		else result.push(max, min);
	}
	result.push(samples[samples.length - 1]);

	const unique = new Map<number, ReplaySample>();
	for (const sample of result) unique.set(sample.timestamp, sample);
	return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp).slice(0, maxPoints);
}

export function getRunReplay(
	projectPath: string,
	runId: string,
	options: { from?: number; to?: number; limit?: number; streamId?: string } = {}
): { run: Run; streams: ReplaySeries[] } {
	const db = getDb(projectPath);
	const run = toRun(requireRun(db, runId));
	const requestedLimit = options.limit ?? DEFAULT_REPLAY_LIMIT;
	const limit = Math.max(1, Math.min(MAX_REPLAY_LIMIT, Math.floor(requestedLimit)));
	const clauses = ['run_id = ?'];
	const params: unknown[] = [runId];
	if (options.from !== undefined) {
		assertFiniteTimestamp(options.from);
		clauses.push('end_ts >= ?');
		params.push(options.from);
	}
	if (options.to !== undefined) {
		assertFiniteTimestamp(options.to);
		clauses.push('start_ts <= ?');
		params.push(options.to);
	}
	if (options.streamId) {
		clauses.push('stream_id = ?');
		params.push(options.streamId);
	}
	const rows = db
		.prepare(
			`SELECT stream_id, kind, start_ts, end_ts, payload
			 FROM telemetry_chunks WHERE ${clauses.join(' AND ')}
			 ORDER BY stream_id, kind, sequence`
		)
		.all(...params) as {
		stream_id: string;
		kind: RecordedSampleKind;
		start_ts: number;
		end_ts: number;
		payload: unknown;
	}[];

	const bySeries = new Map<string, ReplaySample[]>();
	for (const row of rows) {
		const key = `${row.stream_id}\u0000${row.kind}`;
		const series = bySeries.get(key) ?? [];
		for (const item of decodeChunk(row.payload)) {
			if (options.from !== undefined && item.timestamp < options.from) continue;
			if (options.to !== undefined && item.timestamp > options.to) continue;
			series.push({
				timestamp: item.timestamp,
				kind: row.kind,
				...item.values,
				value: firstNumericValue(item.values)
			});
		}
		bySeries.set(key, series);
	}

	const streams: ReplaySeries[] = [];
	for (const [key, samples] of bySeries) {
		const separator = key.indexOf('\u0000');
		const data = samples.sort((a, b) => a.timestamp - b.timestamp);
		streams.push({
			streamId: key.slice(0, separator),
			kind: key.slice(separator + 1) as RecordedSampleKind,
			data: downsamplePeaks(data, limit)
		});
	}
	streams.sort((a, b) => a.streamId.localeCompare(b.streamId) || a.kind.localeCompare(b.kind));
	return { run, streams };
}

export function recordHealthMetric(
	projectPath: string,
	runId: string,
	ts: number,
	metric: string,
	value: number | null,
	details: Record<string, unknown> = {}
): RunHealthMetric {
	assertFiniteTimestamp(ts);
	if (!metric.trim()) throw new BadRequestError('Health metric name is required');
	const db = getDb(projectPath);
	requireRun(db, runId);
	const id = randomUUID();
	const createdAt = new Date().toISOString();
	db.prepare(
		`INSERT INTO run_health_metrics (id, run_id, ts, metric, value, details, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	).run(id, runId, ts, metric.trim(), value, JSON.stringify(details), createdAt);
	return { id, runId, ts, metric: metric.trim(), value, details, createdAt };
}

export function listHealthMetrics(projectPath: string, runId: string): RunHealthMetric[] {
	const db = getDb(projectPath);
	requireRun(db, runId);
	const rows = db
		.prepare(
			`SELECT id, run_id, ts, metric, value, details, created_at
			 FROM run_health_metrics WHERE run_id = ? ORDER BY ts, created_at`
		)
		.all(runId) as {
		id: string;
		run_id: string;
		ts: number;
		metric: string;
		value: number | null;
		details: string;
		created_at: string;
	}[];
	return rows.map((row) => ({
		id: row.id,
		runId: row.run_id,
		ts: row.ts,
		metric: row.metric,
		value: row.value,
		details: parseObject(row.details),
		createdAt: row.created_at
	}));
}

/** Used by stream queries that need one explicit run without exposing chunks. */
export function getRunStreamSamples(
	projectPath: string,
	runId: string,
	streamId: string,
	from?: number,
	to?: number,
	limit?: number
): ReplaySample[] {
	return (
		getRunReplay(projectPath, runId, { from, to, limit, streamId }).streams.find(
			(stream) => stream.streamId === streamId
		)?.data ?? []
	);
}
