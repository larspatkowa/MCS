import { getDb } from './db.js';
import { BadRequestError, NotFoundError } from './errors.js';

export type SourceTimestampUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

export interface TelemetrySourceConfig {
	id: string;
	name: string;
	timeSystem: string;
	timestampUnit: SourceTimestampUnit;
	clockOffsetSeconds: number;
	clockDriftPpm: number;
	clockReferenceSourceSeconds: number;
	clockUncertaintyMs: number | null;
	expectedPeriodMs: number | null;
	lastReceivedAt: number | null;
	lastEventAt: number | null;
	lastSequence: number | null;
	missingSequenceCount: number;
	openGapCount: number;
	status: 'empty' | 'fresh' | 'stale';
	freshnessThresholdMs: number;
	lastClockQuality: string | null;
	lastClockUncertaintyMs: number | null;
}

export interface SourceConfigInput {
	name?: string;
	timeSystem?: string;
	timestampUnit?: SourceTimestampUnit;
	clockOffsetSeconds?: number;
	clockDriftPpm?: number;
	clockReferenceSourceSeconds?: number;
	clockUncertaintyMs?: number | null;
	expectedPeriodMs?: number | null;
}

interface SourceRow {
	id: string;
	name: string;
	time_system: string;
	timestamp_unit: SourceTimestampUnit;
	clock_offset_seconds: number;
	clock_drift_ppm: number;
	clock_reference_source_seconds: number;
	clock_uncertainty_ms: number | null;
	expected_period_ms: number | null;
	last_received_at: number | null;
	last_event_at: number | null;
	last_sequence: number | null;
	missing_sequence_count: number;
	open_gap_count: number;
	last_quality_json: string | null;
}

function asSource(row: SourceRow, now = Date.now() / 1000): TelemetrySourceConfig {
	const freshnessThresholdMs = Math.max(10_000, (row.expected_period_ms ?? 0) * 3);
	const status =
		row.last_received_at === null
			? 'empty'
			: (now - row.last_received_at) * 1000 > freshnessThresholdMs
				? 'stale'
				: 'fresh';
	return {
		id: row.id,
		name: row.name,
		timeSystem: row.time_system,
		timestampUnit: row.timestamp_unit,
		clockOffsetSeconds: row.clock_offset_seconds,
		clockDriftPpm: row.clock_drift_ppm,
		clockReferenceSourceSeconds: row.clock_reference_source_seconds,
		clockUncertaintyMs: row.clock_uncertainty_ms,
		expectedPeriodMs: row.expected_period_ms,
		lastReceivedAt: row.last_received_at,
		lastEventAt: row.last_event_at,
		lastSequence: row.last_sequence,
		missingSequenceCount: row.missing_sequence_count,
		openGapCount: row.open_gap_count,
		status,
		freshnessThresholdMs,
		lastClockQuality: latestQuality(row.last_quality_json)?.quality ?? null,
		lastClockUncertaintyMs:
			latestQuality(row.last_quality_json)?.uncertaintyMs ?? row.clock_uncertainty_ms
	};
}

function latestQuality(value: string | null): {
	quality: string | null;
	uncertaintyMs: number | null;
} {
	if (!value) return { quality: null, uncertaintyMs: null };
	try {
		const parsed = JSON.parse(value) as {
			quality?: { clock?: unknown; clockUncertaintySeconds?: unknown };
		};
		const clock = parsed.quality?.clock;
		const uncertaintySeconds = parsed.quality?.clockUncertaintySeconds;
		return {
			quality: typeof clock === 'string' ? clock : null,
			uncertaintyMs:
				typeof uncertaintySeconds === 'number' && Number.isFinite(uncertaintySeconds)
					? Math.round(uncertaintySeconds * 1000)
					: null
		};
	} catch {
		return { quality: null, uncertaintyMs: null };
	}
}

const SOURCE_SELECT = `SELECT s.id,s.name,s.time_system,s.timestamp_unit,s.clock_offset_seconds,s.clock_drift_ppm,
	s.clock_reference_source_seconds,s.clock_uncertainty_ms,s.expected_period_ms,s.last_received_at,s.last_event_at,
	s.last_sequence,s.missing_sequence_count,
	(SELECT COUNT(*) FROM telemetry_gaps g WHERE g.source_id=s.id AND g.resolved_at IS NULL) AS open_gap_count,
	(SELECT quality_json FROM telemetry_history h WHERE h.source_id=s.id ORDER BY h.id DESC LIMIT 1) AS last_quality_json
	FROM telemetry_sources s`;

function validateNumber(
	value: unknown,
	name: string,
	options: { nullable?: boolean; minimum?: number } = {}
): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null && options.nullable) return null;
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		(options.minimum !== undefined && value < options.minimum)
	) {
		throw new BadRequestError(
			`${name} must be a finite number${options.minimum === undefined ? '' : ` greater than or equal to ${options.minimum}`}`
		);
	}
	return value;
}

export function getSource(projectPath: string, sourceId: string): TelemetrySourceConfig | null {
	const row = getDb(projectPath).prepare(`${SOURCE_SELECT} WHERE s.id=?`).get(sourceId) as
		SourceRow | undefined;
	return row ? asSource(row) : null;
}

export function getSourceClock(
	projectPath: string,
	sourceId: string
): {
	timeSystem: string;
	timestampUnit: SourceTimestampUnit;
	offsetSeconds: number;
	driftPpm: number;
	referenceSourceSeconds: number;
	uncertaintySeconds?: number;
} {
	const source = getSource(projectPath, sourceId);
	if (!source) throw new NotFoundError(`Unknown telemetry source: ${sourceId}`);
	return {
		timeSystem: source.timeSystem,
		timestampUnit: source.timestampUnit,
		offsetSeconds: source.clockOffsetSeconds,
		driftPpm: source.clockDriftPpm,
		referenceSourceSeconds: source.clockReferenceSourceSeconds,
		...(source.clockUncertaintyMs === null
			? {}
			: { uncertaintySeconds: source.clockUncertaintyMs / 1000 })
	};
}

export function listSources(projectPath: string): TelemetrySourceConfig[] {
	const rows = getDb(projectPath)
		.prepare(`${SOURCE_SELECT} ORDER BY s.name,s.id`)
		.all() as SourceRow[];
	return rows.map((row) => asSource(row));
}

export function upsertSource(
	projectPath: string,
	sourceId: string,
	input: SourceConfigInput
): TelemetrySourceConfig {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new BadRequestError('Source settings must be an object');
	if (input.name !== undefined && typeof input.name !== 'string')
		throw new BadRequestError('name must be a string');
	if (input.timeSystem !== undefined && typeof input.timeSystem !== 'string')
		throw new BadRequestError('timeSystem must be a string');
	const db = getDb(projectPath);
	const current = getSource(projectPath, sourceId);
	const name = input.name?.trim() || current?.name || sourceId;
	if (name.length > 200) throw new BadRequestError('name is too long');
	const timeSystem = input.timeSystem?.trim() || current?.timeSystem || 'unix-utc';
	if (timeSystem.length > 64) throw new BadRequestError('timeSystem is too long');
	const timestampUnit = input.timestampUnit ?? current?.timestampUnit ?? 'seconds';
	if (!['seconds', 'milliseconds', 'microseconds', 'nanoseconds'].includes(timestampUnit)) {
		throw new BadRequestError('Unsupported timestampUnit');
	}
	const offset =
		validateNumber(input.clockOffsetSeconds, 'clockOffsetSeconds') ??
		current?.clockOffsetSeconds ??
		0;
	const drift = validateNumber(input.clockDriftPpm, 'clockDriftPpm') ?? current?.clockDriftPpm ?? 0;
	const reference =
		validateNumber(input.clockReferenceSourceSeconds, 'clockReferenceSourceSeconds') ??
		current?.clockReferenceSourceSeconds ??
		0;
	const uncertainty = validateNumber(input.clockUncertaintyMs, 'clockUncertaintyMs', {
		nullable: true,
		minimum: 0
	});
	const expectedPeriod = validateNumber(input.expectedPeriodMs, 'expectedPeriodMs', {
		nullable: true,
		minimum: 1
	});
	const now = new Date().toISOString();
	db.prepare(
		`INSERT INTO telemetry_sources
		(id,name,time_system,timestamp_unit,clock_offset_seconds,clock_drift_ppm,clock_reference_source_seconds,clock_uncertainty_ms,expected_period_ms,created_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET name=excluded.name,time_system=excluded.time_system,timestamp_unit=excluded.timestamp_unit,
		clock_offset_seconds=excluded.clock_offset_seconds,clock_drift_ppm=excluded.clock_drift_ppm,
		clock_reference_source_seconds=excluded.clock_reference_source_seconds,clock_uncertainty_ms=excluded.clock_uncertainty_ms,
		expected_period_ms=excluded.expected_period_ms,updated_at=excluded.updated_at`
	).run(
		sourceId,
		name,
		timeSystem,
		timestampUnit,
		offset,
		drift,
		reference,
		uncertainty === undefined ? (current?.clockUncertaintyMs ?? null) : uncertainty,
		expectedPeriod === undefined ? (current?.expectedPeriodMs ?? null) : expectedPeriod,
		now,
		now
	);
	return getSource(projectPath, sourceId)!;
}

/** Default source row for compatibility ingests and bridge-created sources. */
export function ensureSource(
	projectPath: string,
	sourceId: string,
	name = sourceId,
	timeSystem = 'unix-utc',
	unit: SourceTimestampUnit = 'seconds'
): void {
	const now = new Date().toISOString();
	getDb(projectPath)
		.prepare(
			`INSERT OR IGNORE INTO telemetry_sources (id,name,time_system,timestamp_unit,created_at,updated_at)
		VALUES (?,?,?,?,?,?)`
		)
		.run(sourceId, name, timeSystem, unit, now, now);
}
