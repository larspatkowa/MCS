/**
 * Source clock normalization for telemetry ingest.
 *
 * Unix UTC timestamps are converted by scale only. UTC is accepted as an alias
 * with the same Unix epoch semantics. GPS timestamps use seconds from the GPS
 * epoch; TAI timestamps use a Unix-aligned TAI epoch. Other conventions need
 * an explicit adapter so their epoch cannot be silently guessed.
 */
export type TimestampUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

export type ClockQuality = 'unknown' | 'excellent' | 'good' | 'degraded';

export interface SourceTimeAdapter {
	/** Convert a source time value already expressed in seconds to Unix UTC seconds. */
	toUnixUtcSeconds(sourceSeconds: number): number;
	/** Stable identifier recorded as provenance for the conversion. */
	name: string;
}

const sourceTimeAdapters = new Map<string, SourceTimeAdapter>();

/**
 * Register a trusted server-side converter for a source time scale that MCS
 * does not understand. The returned disposer only removes this registration.
 */
export function registerSourceTimeAdapter(
	timeSystem: string,
	adapter: SourceTimeAdapter
): () => void {
	const key = timeSystem.trim().toLowerCase();
	if (!key) throw new RangeError('timeSystem is required');
	if (
		key === 'utc' ||
		key === 'unix-utc' ||
		key === 'gps' ||
		key === 'gps-seconds' ||
		key === 'tai' ||
		key === 'tai-unix'
	) {
		throw new RangeError(`Built-in time system cannot be overridden: ${timeSystem}`);
	}
	if (!adapter.name.trim() || typeof adapter.toUnixUtcSeconds !== 'function') {
		throw new RangeError('Clock adapter requires a name and converter');
	}
	if (sourceTimeAdapters.has(key))
		throw new RangeError(`Clock adapter is already registered for ${timeSystem}`);
	sourceTimeAdapters.set(key, adapter);
	return () => {
		if (sourceTimeAdapters.get(key) === adapter) sourceTimeAdapters.delete(key);
	};
}

/** Return a registered, trusted server-side converter for a named time scale. */
export function sourceTimeAdapterFor(timeSystem: string): SourceTimeAdapter | undefined {
	return sourceTimeAdapters.get(timeSystem.trim().toLowerCase());
}

export interface ClockNormalizationConfig {
	timeSystem: string;
	offsetSeconds?: number;
	driftPpm?: number;
	referenceSourceSeconds?: number;
	uncertaintySeconds?: number;
	adapter?: SourceTimeAdapter;
}

export interface NormalizedSourceTime {
	/** Original source value, unchanged and in the originally declared unit. */
	sourceTimestamp: number | string;
	sourceTimestampUnit: TimestampUnit;
	timeSystem: string;
	sourceSeconds: number;
	eventTimeUtc: number;
	quality: {
		clockQuality: ClockQuality;
		uncertaintySeconds: number | null;
		provenance: {
			adapter: string | null;
			offsetSeconds: number;
			driftPpm: number;
			referenceSourceSeconds: number;
			driftCorrectionSeconds: number;
			timeSystemConversion: 'unix-utc' | 'gps' | 'tai' | 'adapter';
		};
	};
}

const UNIT_TO_SECONDS: Record<TimestampUnit, number> = {
	seconds: 1,
	milliseconds: 1e-3,
	microseconds: 1e-6,
	nanoseconds: 1e-9
};

const GPS_EPOCH_UNIX_SECONDS = 315_964_800;

// Effective UTC instants and TAI-UTC values from the NIST/IERS leap-second
// record. The table is versioned in provenance and can be replaced alongside
// a project migration when an authority announces a new leap second.
const TAI_UTC_STEPS: readonly [number, number][] = [
	['1972-01-01T00:00:00Z', 10],
	['1972-07-01T00:00:00Z', 11],
	['1973-01-01T00:00:00Z', 12],
	['1974-01-01T00:00:00Z', 13],
	['1975-01-01T00:00:00Z', 14],
	['1976-01-01T00:00:00Z', 15],
	['1977-01-01T00:00:00Z', 16],
	['1978-01-01T00:00:00Z', 17],
	['1979-01-01T00:00:00Z', 18],
	['1980-01-01T00:00:00Z', 19],
	['1981-07-01T00:00:00Z', 20],
	['1982-07-01T00:00:00Z', 21],
	['1983-07-01T00:00:00Z', 22],
	['1985-07-01T00:00:00Z', 23],
	['1988-01-01T00:00:00Z', 24],
	['1990-01-01T00:00:00Z', 25],
	['1991-01-01T00:00:00Z', 26],
	['1992-07-01T00:00:00Z', 27],
	['1993-07-01T00:00:00Z', 28],
	['1994-07-01T00:00:00Z', 29],
	['1996-01-01T00:00:00Z', 30],
	['1997-07-01T00:00:00Z', 31],
	['1999-01-01T00:00:00Z', 32],
	['2006-01-01T00:00:00Z', 33],
	['2009-01-01T00:00:00Z', 34],
	['2012-07-01T00:00:00Z', 35],
	['2015-07-01T00:00:00Z', 36],
	['2017-01-01T00:00:00Z', 37]
].map(([instant, offset]) => [Date.parse(instant as string) / 1000, offset as number]);

function taiMinusUtc(utcSeconds: number): number {
	let offset: number | undefined;
	for (const [effectiveUtc, value] of TAI_UTC_STEPS) {
		if (utcSeconds < effectiveUtc) break;
		offset = value;
	}
	if (offset === undefined)
		throw new RangeError('TAI/GPS conversion before 1972 requires an explicit adapter');
	return offset;
}

function convertBuiltInTimeSystem(
	system: string,
	sourceSeconds: number
): {
	unixSeconds: number;
	name: string;
	conversion: 'gps' | 'tai';
} | null {
	if (system === 'gps' || system === 'gps-seconds') {
		let unixSeconds = GPS_EPOCH_UNIX_SECONDS + sourceSeconds;
		for (let i = 0; i < 3; i++) {
			unixSeconds = GPS_EPOCH_UNIX_SECONDS + sourceSeconds - (taiMinusUtc(unixSeconds) - 19);
		}
		return { unixSeconds, name: 'mcs-gps-utc-2017-v1', conversion: 'gps' };
	}
	if (system === 'tai' || system === 'tai-unix') {
		let unixSeconds = sourceSeconds - 37;
		for (let i = 0; i < 3; i++) unixSeconds = sourceSeconds - taiMinusUtc(unixSeconds);
		return { unixSeconds, name: 'mcs-tai-utc-2017-v1', conversion: 'tai' };
	}
	return null;
}

function finite(value: number, name: string): void {
	if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function qualityForUncertainty(uncertaintySeconds: number | undefined): ClockQuality {
	if (uncertaintySeconds === undefined) return 'unknown';
	if (uncertaintySeconds <= 0.01) return 'excellent';
	if (uncertaintySeconds <= 1) return 'good';
	return 'degraded';
}

/** Convert source time into normalized Unix UTC while preserving its raw form. */
export function normalizeSourceTime(
	sourceTimestamp: number | string,
	unit: TimestampUnit,
	config: ClockNormalizationConfig
): NormalizedSourceTime {
	const numericTimestamp = Number(sourceTimestamp);
	finite(numericTimestamp, 'sourceTimestamp');
	const unitScale = UNIT_TO_SECONDS[unit];
	if (unitScale === undefined) throw new RangeError(`Unsupported timestamp unit: ${String(unit)}`);
	const sourceSeconds = numericTimestamp * unitScale;
	finite(sourceSeconds, 'source timestamp in seconds');

	const offsetSeconds = config.offsetSeconds ?? 0;
	const driftPpm = config.driftPpm ?? 0;
	const referenceSourceSeconds = config.referenceSourceSeconds ?? 0;
	const uncertaintySeconds = config.uncertaintySeconds;
	finite(offsetSeconds, 'offsetSeconds');
	finite(driftPpm, 'driftPpm');
	finite(referenceSourceSeconds, 'referenceSourceSeconds');
	if (uncertaintySeconds !== undefined) {
		finite(uncertaintySeconds, 'uncertaintySeconds');
		if (uncertaintySeconds < 0) throw new RangeError('uncertaintySeconds must not be negative');
	}

	const system = config.timeSystem.trim().toLowerCase();
	let baseUnixSeconds: number;
	let adapterName: string | null = null;
	let timeSystemConversion: 'unix-utc' | 'gps' | 'tai' | 'adapter';
	if (system === 'unix-utc' || system === 'utc') {
		baseUnixSeconds = sourceSeconds;
		timeSystemConversion = 'unix-utc';
	} else {
		const builtIn = convertBuiltInTimeSystem(system, sourceSeconds);
		if (builtIn) {
			baseUnixSeconds = builtIn.unixSeconds;
			adapterName = builtIn.name;
			timeSystemConversion = builtIn.conversion;
		} else {
			if (!config.adapter) {
				throw new RangeError(
					`Unsupported time system without conversion adapter: ${config.timeSystem}`
				);
			}
			baseUnixSeconds = config.adapter.toUnixUtcSeconds(sourceSeconds);
			finite(baseUnixSeconds, 'adapter output');
			adapterName = config.adapter.name;
			timeSystemConversion = 'adapter';
		}
	}

	const driftCorrectionSeconds = ((sourceSeconds - referenceSourceSeconds) * driftPpm) / 1e6;
	const eventTimeUtc = baseUnixSeconds + offsetSeconds + driftCorrectionSeconds;
	finite(eventTimeUtc, 'eventTimeUtc');

	return {
		sourceTimestamp,
		sourceTimestampUnit: unit,
		timeSystem: config.timeSystem,
		sourceSeconds,
		eventTimeUtc,
		quality: {
			clockQuality: qualityForUncertainty(uncertaintySeconds),
			uncertaintySeconds: uncertaintySeconds ?? null,
			provenance: {
				adapter: adapterName,
				offsetSeconds,
				driftPpm,
				referenceSourceSeconds,
				driftCorrectionSeconds,
				timeSystemConversion
			}
		}
	};
}
