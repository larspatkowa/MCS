import { randomUUID } from 'crypto';
import { getDb } from './db.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LimitConfig {
	streamId: string;
	field: string;
	yellowLow: number | null;
	yellowHigh: number | null;
	redLow: number | null;
	redHigh: number | null;
	enabled: boolean;
}

export type LimitSeverity = 'yellow' | 'red';

export interface LimitEvent {
	id: string;
	streamId: string;
	field: string;
	ts: number;
	value: number;
	severity: LimitSeverity;
	label: string;
	ackedAt: string | null;
	createdAt: string;
}

// ─── Limit Config CRUD ────────────────────────────────────────────────────────

export function getLimitConfigs(projectPath: string, streamId?: string): LimitConfig[] {
	const db = getDb(projectPath);
	const rows = streamId
		? (db
				.prepare(
					'SELECT stream_id, field, yellow_low, yellow_high, red_low, red_high, enabled FROM limit_configs WHERE stream_id = ?'
				)
				.all(streamId) as LimitConfigRow[])
		: (db
				.prepare(
					'SELECT stream_id, field, yellow_low, yellow_high, red_low, red_high, enabled FROM limit_configs ORDER BY stream_id, field'
				)
				.all() as LimitConfigRow[]);
	return rows.map(rowToConfig);
}

interface LimitConfigRow {
	stream_id: string;
	field: string;
	yellow_low: number | null;
	yellow_high: number | null;
	red_low: number | null;
	red_high: number | null;
	enabled: number;
}

function rowToConfig(row: LimitConfigRow): LimitConfig {
	return {
		streamId: row.stream_id,
		field: row.field,
		yellowLow: row.yellow_low,
		yellowHigh: row.yellow_high,
		redLow: row.red_low,
		redHigh: row.red_high,
		enabled: row.enabled === 1
	};
}

export function setLimitConfig(
	projectPath: string,
	streamId: string,
	field: string,
	config: Omit<LimitConfig, 'streamId' | 'field'>
): void {
	const db = getDb(projectPath);
	const now = new Date().toISOString();
	db.prepare(
		`
		INSERT INTO limit_configs (stream_id, field, yellow_low, yellow_high, red_low, red_high, enabled, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (stream_id, field) DO UPDATE SET
			yellow_low = excluded.yellow_low,
			yellow_high = excluded.yellow_high,
			red_low = excluded.red_low,
			red_high = excluded.red_high,
			enabled = excluded.enabled,
			updated_at = excluded.updated_at
	`
	).run(
		streamId,
		field,
		config.yellowLow ?? null,
		config.yellowHigh ?? null,
		config.redLow ?? null,
		config.redHigh ?? null,
		config.enabled ? 1 : 0,
		now
	);
}

export function deleteLimitConfig(projectPath: string, streamId: string, field: string): boolean {
	const db = getDb(projectPath);
	const result = db
		.prepare('DELETE FROM limit_configs WHERE stream_id = ? AND field = ?')
		.run(streamId, field);
	return result.changes > 0;
}

// ─── Limit Events ─────────────────────────────────────────────────────────────

interface LimitEventRow {
	id: string;
	stream_id: string;
	field: string;
	ts: number;
	value: number;
	severity: string;
	label: string;
	acked_at: string | null;
	created_at: string;
}

function rowToEvent(row: LimitEventRow): LimitEvent {
	return {
		id: row.id,
		streamId: row.stream_id,
		field: row.field,
		ts: row.ts,
		value: row.value,
		severity: row.severity as LimitSeverity,
		label: row.label,
		ackedAt: row.acked_at,
		createdAt: row.created_at
	};
}

export function listLimitEvents(
	projectPath: string,
	from: number,
	to: number,
	options: { unackedOnly?: boolean; streamId?: string } = {}
): LimitEvent[] {
	const db = getDb(projectPath);
	const clauses = ['ts >= ?', 'ts <= ?'];
	const params: unknown[] = [from, to];
	if (options.unackedOnly) {
		clauses.push('acked_at IS NULL');
	}
	if (options.streamId) {
		clauses.push('stream_id = ?');
		params.push(options.streamId);
	}
	const rows = db
		.prepare(
			`SELECT id, stream_id, field, ts, value, severity, label, acked_at, created_at
			 FROM limit_events WHERE ${clauses.join(' AND ')} ORDER BY ts DESC`
		)
		.all(...params) as LimitEventRow[];
	return rows.map(rowToEvent);
}

export function createLimitEvent(
	projectPath: string,
	event: Omit<LimitEvent, 'id' | 'ackedAt' | 'createdAt'>
): LimitEvent {
	const db = getDb(projectPath);
	const id = randomUUID();
	const now = new Date().toISOString();
	db.prepare(
		`INSERT INTO limit_events (id, stream_id, field, ts, value, severity, label, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	).run(id, event.streamId, event.field, event.ts, event.value, event.severity, event.label, now);
	return { ...event, id, ackedAt: null, createdAt: now };
}

export function ackLimitEvent(projectPath: string, id: string): boolean {
	const db = getDb(projectPath);
	const now = new Date().toISOString();
	const result = db
		.prepare('UPDATE limit_events SET acked_at = ? WHERE id = ? AND acked_at IS NULL')
		.run(now, id);
	return result.changes > 0;
}

export function ackAllLimitEvents(
	projectPath: string,
	options: { streamId?: string } = {}
): number {
	const db = getDb(projectPath);
	const now = new Date().toISOString();
	let result;
	if (options.streamId) {
		result = db
			.prepare('UPDATE limit_events SET acked_at = ? WHERE stream_id = ? AND acked_at IS NULL')
			.run(now, options.streamId);
	} else {
		result = db.prepare('UPDATE limit_events SET acked_at = ? WHERE acked_at IS NULL').run(now);
	}
	return result.changes;
}

export function deleteLimitEvent(projectPath: string, id: string): boolean {
	const db = getDb(projectPath);
	const result = db.prepare('DELETE FROM limit_events WHERE id = ?').run(id);
	return result.changes > 0;
}

// ─── Limit evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a numeric value against the limit configs for a stream.
 * Returns the worst severity, or null if within all limits.
 */
export function evaluateLimits(
	configs: LimitConfig[],
	field: string,
	value: number
): LimitSeverity | null {
	for (const cfg of configs) {
		if (!cfg.enabled) continue;
		if (cfg.field !== field && cfg.field !== '*') continue;
		// Red first (more severe)
		if (cfg.redLow !== null && value < cfg.redLow) return 'red';
		if (cfg.redHigh !== null && value > cfg.redHigh) return 'red';
		if (cfg.yellowLow !== null && value < cfg.yellowLow) return 'yellow';
		if (cfg.yellowHigh !== null && value > cfg.yellowHigh) return 'yellow';
	}
	return null;
}

// ─── Cooldown tracking ────────────────────────────────────────────────────────

/** In-memory dedup: last event time per (projectPath+streamId+field+severity). */
const lastEventTime = new Map<string, number>();
const COOLDOWN_SEC = 30;

export function shouldEmitLimitEvent(
	projectPath: string,
	streamId: string,
	field: string,
	severity: LimitSeverity,
	ts: number
): boolean {
	const key = `${projectPath}:${streamId}:${field}:${severity}`;
	const last = lastEventTime.get(key) ?? 0;
	if (ts - last < COOLDOWN_SEC) return false;
	lastEventTime.set(key, ts);
	return true;
}
