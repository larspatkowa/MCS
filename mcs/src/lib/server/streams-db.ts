import { randomUUID } from 'crypto';
import { getDb } from './db.js';

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
	const db = getDb(projectPath);
	const row = db
		.prepare('SELECT payload FROM samples WHERE stream_id = ? ORDER BY ts DESC LIMIT 1')
		.get(streamId) as { payload: string } | undefined;
	if (!row) return null;
	try {
		const p = JSON.parse(row.payload) as Record<string, unknown>;
		const keys = Object.keys(p).filter((k) => typeof p[k] === 'number');
		const firstNum = keys.length ? (p[keys[0]] as number) : undefined;
		return { lastValue: firstNum, lastPayload: row.payload };
	} catch {
		return { lastPayload: row.payload };
	}
}

function extractNumericValue(payload: Record<string, unknown>): number | undefined {
	const keys = Object.keys(payload).filter((k) => typeof payload[k] === 'number');
	if (!keys.length) return undefined;
	return payload[keys[0]] as number;
}

export interface StreamSample {
	timestamp: number;
	value: number;
	[key: string]: unknown;
}

export function getStreamSamples(
	projectPath: string,
	streamId: string,
	from?: number,
	to?: number,
	limit?: number
): StreamSample[] {
	const db = getDb(projectPath);

	const clauses: string[] = ['stream_id = ?'];
	const params: unknown[] = [streamId];

	if (typeof from === 'number') {
		clauses.push('ts >= ?');
		params.push(from);
	}
	if (typeof to === 'number') {
		clauses.push('ts <= ?');
		params.push(to);
	}

	const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const limitSql = typeof limit === 'number' && limit > 0 ? 'LIMIT ?' : '';
	if (limitSql) {
		params.push(limit);
	}

	const sql = `SELECT ts, payload FROM samples ${whereSql} ORDER BY ts ASC ${limitSql}`;
	const rows = db.prepare(sql).all(...params) as { ts: number; payload: string }[];

	return rows.map((row) => {
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(row.payload) as Record<string, unknown>;
		} catch {
			payload = {};
		}
		const value = extractNumericValue(payload) ?? NaN;
		return {
			timestamp: row.ts,
			value,
			...payload
		};
	});
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
		| { name: string; metadata: string }
		| undefined;

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

export function ingestSample(
	projectPath: string,
	streamId: string,
	ts: number,
	payload: Record<string, unknown>
): void {
	ensureStream(projectPath, streamId);
	const db = getDb(projectPath);
	db.prepare('INSERT INTO samples (stream_id, ts, payload) VALUES (?, ?, ?)').run(
		streamId,
		ts,
		JSON.stringify(payload)
	);
}

export function listAnnotations(
	projectPath: string,
	from: number,
	to: number
): { id: string; ts: number; label: string; details: string }[] {
	const db = getDb(projectPath);
	const rows = db
		.prepare('SELECT id, ts, label, details FROM annotations WHERE ts >= ? AND ts <= ? ORDER BY ts')
		.all(from, to) as { id: string; ts: number; label: string; details: string }[];
	return rows;
}

export function createAnnotation(
	projectPath: string,
	ts: number,
	label: string,
	details?: string
): { id: string } {
	const db = getDb(projectPath);
	const id = randomUUID();
	const now = new Date().toISOString();
	db.prepare(
		'INSERT INTO annotations (id, ts, label, details, created_at) VALUES (?, ?, ?, ?, ?)'
	).run(id, ts, label, details ?? '', now);
	return { id };
}

export function deleteAnnotation(projectPath: string, annotationId: string): boolean {
	const db = getDb(projectPath);
	const result = db.prepare('DELETE FROM annotations WHERE id = ?').run(annotationId);
	return result.changes > 0;
}
