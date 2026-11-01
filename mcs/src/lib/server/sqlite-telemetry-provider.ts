import { BadRequestError } from './errors.js';
import { getDb } from './db.js';
import * as sourcesDb from './sources-db.js';
import * as streamsDb from './streams-db.js';
import { subscribeStreamEvents } from './stream-events.js';
import {
	MAX_HISTORY_PAGE_SIZE,
	MAX_HISTORY_PAGE_BYTES,
	type TelemetryHistoryPage,
	type TelemetryHistoryQuery,
	type TelemetryLiveEvent,
	type TelemetryLiveSubscription,
	type TelemetryProvider,
	type TelemetrySourceMetadata,
	type TelemetrySample
} from '../telemetry/index.js';

const MAX_LIVE_QUEUE = 512;

interface PageCursor {
	version: 1;
	sourceId: string;
	streamId: string;
	from: number;
	to: number;
	resolution: 'raw' | 'minmax';
	maxSamples: number;
	field?: string;
	lastTime: number;
	lastId: number;
}

interface HistoryRow {
	id: number;
	event_ts: number;
}

function abortIfNeeded(signal?: AbortSignal): void {
	if (signal?.aborted) throw signal.reason ?? new Error('Operation aborted');
}

function encodeCursor(cursor: PageCursor): string {
	return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string, query: TelemetryHistoryQuery): PageCursor {
	let cursor: unknown;
	try {
		cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
	} catch {
		throw new BadRequestError('pageCursor is invalid');
	}
	if (!cursor || typeof cursor !== 'object') throw new BadRequestError('pageCursor is invalid');
	const candidate = cursor as Partial<PageCursor>;
	if (
		candidate.version !== 1 ||
		candidate.resolution !== query.resolution ||
		candidate.sourceId !== query.sourceId ||
		candidate.streamId !== query.streamId ||
		candidate.from !== query.from ||
		candidate.to !== query.to ||
		candidate.maxSamples !== query.maxSamples ||
		candidate.field !== query.field ||
		!Number.isFinite(candidate.lastTime) ||
		!Number.isSafeInteger(candidate.lastId) ||
		(candidate.lastId ?? 0) < 1
	)
		throw new BadRequestError('pageCursor does not match this history query');
	return candidate as PageCursor;
}

function boundedHistoryPage(
	projectPath: string,
	rows: HistoryRow[],
	query: TelemetryHistoryQuery,
	hasMoreFromStore = false
): TelemetryHistoryPage {
	const samples: TelemetrySample[] = [];
	let lastRow: HistoryRow | undefined;
	let scanned = 0;
	let bytes = 0;
	for (const row of rows) {
		if (samples.length >= query.maxSamples) break;
		const sample = streamsDb.getTelemetrySampleById(projectPath, row.id);
		scanned += 1;
		if (!sample) continue;
		const sampleBytes = Buffer.byteLength(JSON.stringify(sample), 'utf8');
		if (samples.length > 0 && bytes + sampleBytes > MAX_HISTORY_PAGE_BYTES) break;
		samples.push(sample);
		bytes += sampleBytes;
		lastRow = row;
	}
	const hasMore = hasMoreFromStore || scanned < rows.length;
	return {
		samples,
		...(hasMore && lastRow
			? {
					nextPageCursor: encodeCursor({
						version: 1,
						sourceId: query.sourceId,
						streamId: query.streamId,
						from: query.from,
						to: query.to,
						resolution: query.resolution as 'raw' | 'minmax',
						maxSamples: query.maxSamples,
						...(query.field === undefined ? {} : { field: query.field }),
						lastTime: lastRow.event_ts,
						lastId: lastRow.id
					})
				}
			: {})
	};
}

function describeField(
	key: string,
	value: unknown
): { key: string; type: 'number' | 'string' | 'boolean' | 'object' | 'array' } {
	const type = Array.isArray(value) ? 'array' : value === null ? 'object' : typeof value;
	return {
		key,
		type:
			type === 'number' || type === 'string' || type === 'boolean' || type === 'array'
				? type
				: 'object'
	};
}

/** Initial SQLite historian and live provider behind the provider extension boundary. */
export class SQLiteTelemetryProvider implements TelemetryProvider {
	readonly id = 'sqlite';
	private readonly projectId: string;
	private readonly projectPath: string;

	constructor(projectId: string, projectPath: string) {
		this.projectId = projectId;
		this.projectPath = projectPath;
	}

	getCapabilities() {
		return {
			live: true,
			history: true,
			resumableLive: true,
			resolutions: ['raw', 'latest', 'minmax'] as const
		};
	}

	async getMetadata(sourceId?: string, signal?: AbortSignal): Promise<TelemetrySourceMetadata[]> {
		abortIfNeeded(signal);
		const sources = sourceId
			? [sourcesDb.getSource(this.projectPath, sourceId)].filter((source) => source !== null)
			: sourcesDb.listSources(this.projectPath);
		const db = getDb(this.projectPath);
		return sources.map((source) => {
			abortIfNeeded(signal);
			const streamRows = db
				.prepare(
					`SELECT DISTINCT st.id AS streamId,st.name,st.metadata
				FROM telemetry_history h JOIN streams st ON st.id=h.stream_id
				WHERE h.source_id=? ORDER BY st.name,st.id`
				)
				.all(source.id) as {
				streamId: string;
				name: string;
				metadata: string;
			}[];
			const streams = streamRows.map((stream) => {
				let metadata: Record<string, unknown> = {};
				try {
					metadata = JSON.parse(stream.metadata) as Record<string, unknown>;
				} catch {}
				const latest = db
					.prepare(
						`SELECT payload FROM telemetry_history WHERE source_id=? AND stream_id=?
					ORDER BY event_ts DESC,id DESC LIMIT 1`
					)
					.get(source.id, stream.streamId) as { payload: string } | undefined;
				let payload: Record<string, unknown> = {};
				try {
					payload = latest ? (JSON.parse(latest.payload) as Record<string, unknown>) : {};
				} catch {}
				const declaredFields = Array.isArray(metadata.fields) ? metadata.fields : null;
				return {
					streamId: stream.streamId,
					name: stream.name,
					...(typeof metadata.description === 'string'
						? { description: metadata.description }
						: {}),
					fields: declaredFields
						? (declaredFields as TelemetrySourceMetadata['streams'][number]['fields'])
						: Object.entries(payload).map(([key, value]) => describeField(key, value))
				};
			});
			return {
				sourceId: source.id,
				name: source.name,
				timeSystem: source.timeSystem,
				streams
			};
		});
	}

	async query(query: TelemetryHistoryQuery, signal?: AbortSignal): Promise<TelemetryHistoryPage> {
		abortIfNeeded(signal);
		validateHistoryQuery(query);
		const db = getDb(this.projectPath);
		if (query.resolution === 'latest') {
			if (query.pageCursor)
				throw new BadRequestError('latest resolution does not support pageCursor');
			const row = db
				.prepare(
					`SELECT id FROM telemetry_history WHERE source_id=? AND stream_id=?
				AND event_ts>=? AND event_ts<=? ORDER BY event_ts DESC,id DESC LIMIT 1`
				)
				.get(query.sourceId, query.streamId, query.from, query.to) as { id: number } | undefined;
			const sample = row ? streamsDb.getTelemetrySampleById(this.projectPath, row.id) : null;
			return { samples: sample ? [sample] : [] };
		}
		if (query.resolution === 'minmax') {
			if (!query.field) throw new BadRequestError('field is required for minmax resolution');
			if (query.maxSamples < 2)
				throw new BadRequestError('minmax resolution requires maxSamples of at least 2');
			const bucketCount = Math.max(1, Math.floor(query.maxSamples / 2));
			const cursor = query.pageCursor ? decodeCursor(query.pageCursor, query) : null;
			const cursorClause = cursor ? 'AND (event_ts>? OR (event_ts=? AND id>?))' : '';
			const params = cursor
				? [
						bucketCount - 1,
						query.from,
						query.to - query.from,
						bucketCount,
						query.sourceId,
						query.streamId,
						query.from,
						query.to,
						query.field,
						cursor.lastTime,
						cursor.lastTime,
						cursor.lastId
					]
				: [
						bucketCount - 1,
						query.from,
						query.to - query.from,
						bucketCount,
						query.sourceId,
						query.streamId,
						query.from,
						query.to,
						query.field
					];
			const rows = db
				.prepare(
					`WITH numeric_rows AS (
					SELECT h.id,h.event_ts,CAST(j.value AS REAL) AS field_value,
						MIN(?, CAST(((h.event_ts-?)/?)*? AS INTEGER)) AS bucket
					FROM telemetry_history h, json_each(h.payload) j
					WHERE h.source_id=? AND h.stream_id=? AND h.event_ts>=? AND h.event_ts<=?
						AND j.key=? AND j.type IN ('integer','real')
				), ranked AS (
					SELECT id,event_ts,bucket,
						ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY field_value,id) AS min_rank,
						ROW_NUMBER() OVER (PARTITION BY bucket ORDER BY field_value DESC,id DESC) AS max_rank
					FROM numeric_rows
				)
				SELECT DISTINCT id,event_ts FROM ranked WHERE (min_rank=1 OR max_rank=1) ${cursorClause} ORDER BY event_ts,id`
				)
				.all(...params) as HistoryRow[];
			return boundedHistoryPage(this.projectPath, rows, query);
		}

		const cursor = query.pageCursor ? decodeCursor(query.pageCursor, query) : null;
		const cursorClause = cursor ? 'AND (event_ts>? OR (event_ts=? AND id>?))' : '';
		const params = cursor
			? [
					query.sourceId,
					query.streamId,
					query.from,
					query.to,
					cursor.lastTime,
					cursor.lastTime,
					cursor.lastId,
					query.maxSamples + 1
				]
			: [query.sourceId, query.streamId, query.from, query.to, query.maxSamples + 1];
		const rows = db
			.prepare(
				`SELECT id,event_ts FROM telemetry_history
			WHERE source_id=? AND stream_id=? AND event_ts>=? AND event_ts<=? ${cursorClause}
			ORDER BY event_ts,id LIMIT ?`
			)
			.all(...params) as HistoryRow[];
		abortIfNeeded(signal);
		return boundedHistoryPage(this.projectPath, rows, query, rows.length > query.maxSamples);
	}

	async *subscribe(request: TelemetryLiveSubscription): AsyncIterable<TelemetryLiveEvent> {
		if (!request.sourceId)
			throw new BadRequestError('sourceId is required for a live subscription');
		const streamIds = request.streamIds ? new Set(request.streamIds) : null;
		const db = getDb(this.projectPath);
		let cursor: number;
		if (request.afterCursor !== undefined) {
			cursor = Number(request.afterCursor);
			if (!Number.isSafeInteger(cursor) || cursor < 0)
				throw new BadRequestError('afterCursor is invalid');
		} else {
			const row = db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM telemetry_history').get() as {
				id: number;
			};
			cursor = row.id;
		}

		let closed = false;
		let overflowed = false;
		const pending = new Set<number>();
		const waiters = new Set<() => void>();
		const wake = () => {
			for (const waiter of waiters) waiter();
			waiters.clear();
		};
		const notify = (event: {
			sourceId?: string;
			streamId: string;
			eventId?: number;
			samples?: { sourceId?: string; streamId?: string; eventId?: number }[];
		}) => {
			const ids = event.samples ?? [event];
			for (const sample of ids) {
				if (
					sample.sourceId !== request.sourceId ||
					(streamIds && !streamIds.has(sample.streamId ?? event.streamId))
				)
					continue;
				if (!sample.eventId || sample.eventId <= cursor || pending.has(sample.eventId)) continue;
				if (pending.size >= MAX_LIVE_QUEUE) {
					overflowed = true;
					wake();
					return;
				}
				pending.add(sample.eventId);
			}
			wake();
		};
		const unsubscribe = subscribeStreamEvents(this.projectId, notify);
		const onAbort = () => {
			closed = true;
			wake();
		};
		request.signal?.addEventListener('abort', onAbort, { once: true });
		if (request.signal?.aborted) onAbort();

		try {
			// Subscribe before catch-up, then merge durable rows with the bounded
			// notifier queue. Event IDs suppress duplicates across the boundary.
			for (;;) {
				abortIfNeeded(request.signal);
				const history = streamsDb.getHistoryEventsAfter(
					this.projectPath,
					cursor,
					10_000,
					request.sourceId
				);
				for (const event of history) {
					if (event.eventId <= cursor || (streamIds && !streamIds.has(event.streamId))) continue;
					const sample = streamsDb.getTelemetrySampleById(this.projectPath, event.eventId);
					if (!sample) continue;
					const gap =
						sample.sequence === undefined
							? null
							: sequenceGapBefore(
									this.projectPath,
									request.sourceId,
									sample.streamId,
									event.eventId,
									sample.sequence
								);
					if (gap) yield { type: 'gap', event: gap, cursor: String(cursor) };
					yield { type: 'sample', sample, cursor: String(event.eventId) };
					cursor = event.eventId;
				}
				if (history.length < 10_000) break;
			}

			while (!closed) {
				abortIfNeeded(request.signal);
				if (overflowed) {
					yield {
						type: 'gap',
						event: {
							type: 'gap',
							sourceId: request.sourceId,
							observedAt: Date.now() / 1000,
							reason: 'buffer-overflow'
						},
						cursor: String(cursor)
					};
					return;
				}
				const ids = [...pending].sort((a, b) => a - b);
				pending.clear();
				if (ids.length === 0) {
					await new Promise<void>((resolve) => waiters.add(resolve));
					continue;
				}
				for (const id of ids) {
					if (id <= cursor) continue;
					const sample = streamsDb.getTelemetrySampleById(this.projectPath, id);
					if (
						!sample ||
						sample.sourceId !== request.sourceId ||
						(streamIds && !streamIds.has(sample.streamId))
					)
						continue;
					const gap =
						sample.sequence === undefined
							? null
							: sequenceGapBefore(
									this.projectPath,
									request.sourceId,
									sample.streamId,
									id,
									sample.sequence
								);
					if (gap) yield { type: 'gap', event: gap, cursor: String(cursor) };
					yield { type: 'sample', sample, cursor: String(id) };
					cursor = id;
				}
			}
		} finally {
			closed = true;
			unsubscribe();
			request.signal?.removeEventListener('abort', onAbort);
			wake();
		}
	}
}

function validateHistoryQuery(query: TelemetryHistoryQuery): void {
	if (!Number.isFinite(query.from) || !Number.isFinite(query.to) || query.to <= query.from) {
		throw new BadRequestError('History bounds must be finite and to must be greater than from');
	}
	if (
		!Number.isInteger(query.maxSamples) ||
		query.maxSamples < 1 ||
		query.maxSamples > MAX_HISTORY_PAGE_SIZE
	) {
		throw new BadRequestError(`maxSamples must be an integer from 1 to ${MAX_HISTORY_PAGE_SIZE}`);
	}
	if (
		!query.sourceId ||
		query.sourceId.length > 200 ||
		!query.streamId ||
		query.streamId.length > 200
	) {
		throw new BadRequestError('sourceId and streamId are required');
	}
}

function sequenceGapBefore(
	projectPath: string,
	sourceId: string,
	streamId: string,
	beforeId: number,
	sequence: number
): import('../telemetry/index.js').TelemetryGapEvent | null {
	const row = getDb(projectPath)
		.prepare(
			`SELECT source_sequence FROM telemetry_history
		WHERE source_id=? AND stream_id=? AND id<? AND source_sequence IS NOT NULL
		ORDER BY id DESC LIMIT 1`
		)
		.get(sourceId, streamId, beforeId) as { source_sequence: number } | undefined;
	if (!row || sequence <= row.source_sequence + 1) return null;
	return {
		type: 'gap',
		sourceId,
		streamId,
		firstMissingSequence: row.source_sequence + 1,
		lastMissingSequence: sequence - 1,
		observedAt: Date.now() / 1000,
		reason: 'sequence-gap'
	};
}
