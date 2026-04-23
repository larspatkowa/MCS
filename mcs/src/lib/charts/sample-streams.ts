/**
 * Frontend-only sample stream sources for gauges and charts.
 * No backend; when plugins feed real data, use real stream IDs and the API.
 *
 * These simulate rocketry telemetry — altitude curves, acceleration, etc.
 * All streams include realistic random noise so every render looks unique,
 * while still following plausible physical trajectories.
 */

export const SAMPLE_STREAM_IDS = [
	'sample:sine',
	'sample:random',
	'sample:step',
	'sample:altitude',
	'sample:velocity',
	'sample:accel_z',
	'sample:temperature',
	'sample:battery',
	'sample:gps',
	'sample:angle'
] as const;
export type SampleStreamId = (typeof SAMPLE_STREAM_IDS)[number];

const SAMPLE_LABELS: Record<SampleStreamId, string> = {
	'sample:sine': 'Sine',
	'sample:random': 'Random',
	'sample:step': 'Step',
	'sample:altitude': 'Altitude (m)',
	'sample:velocity': 'Velocity (m/s)',
	'sample:accel_z': 'Accel Z (m/s²)',
	'sample:temperature': 'Temperature (°C)',
	'sample:battery': 'Battery (%)',
	'sample:gps': 'GPS Position',
	'sample:angle': 'Angle (°)'
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Fast seeded PRNG (xorshift32) — deterministic per-timestamp so series stay consistent. */
function seededRandom(seed: number): number {
	let s = Math.imul(seed | 0, 1597334677) ^ 0x9e3779b9;
	s = Math.imul(s ^ (s >>> 16), 2246822507);
	s = Math.imul(s ^ (s >>> 13), 3266489909);
	s = (s ^= s >>> 16) >>> 0;
	return s / 4294967296;
}

/** Generate noise that varies per timestamp but is reproducible for the same t. */
function noise(t: number, scale: number = 1, seed: number = 0): number {
	const bucket = Math.floor(t * 10); // 100ms resolution
	return (seededRandom(bucket + seed * 99991) - 0.5) * 2 * scale;
}

export function isSampleStreamId(id: string): id is SampleStreamId {
	return (SAMPLE_STREAM_IDS as readonly string[]).includes(id);
}

export function getSampleStreamOptions(): { id: string; name: string }[] {
	return SAMPLE_STREAM_IDS.map((id) => ({
		id,
		name: `Sample: ${SAMPLE_LABELS[id]}`
	}));
}

/**
 * Simulated rocket flight curve.  The flight repeats on a 120-second cycle:
 *   0-10s  pad/ignition
 *   10-25s boost  (motor burn)
 *   25-60s coast  (rising to apogee at ~60s)
 *   60-90s drogue descent
 *   90-120s main chute descent
 *
 * Now with realistic random vibration/noise layered on top of the deterministic
 * trajectory so that no two moments look identical.
 */
function flightPhase(t: number): { phase: number; altitude: number; velocity: number } {
	const cycle = 120;
	const tCyc = ((t % cycle) + cycle) % cycle;

	let altitude = 0;
	let velocity = 0;

	if (tCyc < 10) {
		altitude = 0 + noise(t, 0.3, 1);
		velocity = 0 + noise(t, 0.2, 2);
	} else if (tCyc < 25) {
		const tb = tCyc - 10;
		altitude = 0.9 * tb * tb + noise(t, 4, 3);
		velocity = 1.8 * tb + noise(t, 1.5, 4);
	} else if (tCyc < 60) {
		const tc = tCyc - 25;
		const v0 = 27;
		const g = 9.81;
		altitude = 202.5 + v0 * tc - 0.5 * g * tc * tc + noise(t, 6, 5);
		velocity = v0 - g * tc + noise(t, 2, 6);
	} else if (tCyc < 90) {
		const td = tCyc - 60;
		const truePeak = Math.max(0, 202.5 + 27 * (35 / 2));
		altitude = Math.max(0, truePeak - 15 * td) + noise(t, 3, 7);
		velocity = -15 + noise(t, 1.8, 8);
	} else {
		const tm = tCyc - 90;
		const truePeak = Math.max(0, 202.5 + 27 * 17.5 - 0.5 * 9.81 * 17.5 * 17.5);
		const afterDrogue = Math.max(0, truePeak - 15 * 30);
		altitude = Math.max(0, afterDrogue - 4.5 * tm) + noise(t, 1.5, 9);
		velocity = -4.5 + noise(t, 0.8, 10);
	}

	altitude = Math.max(0, altitude);
	return { phase: tCyc, altitude, velocity };
}

/**
 * GPS simulation: a ground-track for a model rocket launched from a fixed pad
 * that drifts with wind during flight. In the 120-second cycle:
 *  - Pad phase: stays near launch site
 *  - Flight: drifts downwind
 *  - Descent: slower drift, lands offset from pad
 */
export function getSampleGpsPoint(t: number): { lat: number; lon: number; alt: number } {
	const { altitude, phase } = flightPhase(t);
	const baseLat = 28.5729; // Kennedy Space Center
	const baseLon = -80.649;
	// Wind vector with random gusting
	const windLat = 0.0001 * Math.sin(t / 45) + noise(t, 0.00003, 50);
	const windLon = 0.00015 * Math.cos(t / 60) + noise(t, 0.00004, 51);
	// Drift proportional to flight time
	const flightTime = phase > 10 ? Math.min(phase - 10, 110) : 0;
	const lat = baseLat + windLat * flightTime + noise(t, 0.00005, 52);
	const lon = baseLon + windLon * flightTime + noise(t, 0.00005, 53);
	return { lat, lon, alt: altitude };
}

/** Current scalar value for a sample stream (for gauges). Time-based. */
export function getSampleStreamValue(streamId: string): number {
	const t = Date.now() / 1000;
	const { altitude, velocity, phase } = flightPhase(t);

	switch (streamId) {
		case 'sample:altitude':
			return Math.round(altitude * 10) / 10;
		case 'sample:velocity':
			return Math.round(velocity * 10) / 10;
		case 'sample:accel_z': {
			const isBoost = phase >= 10 && phase < 25;
			const base = isBoost ? 28 + noise(t, 6, 20) : -9.81;
			return Math.round((base + noise(t, 2.5, 21)) * 10) / 10;
		}
		case 'sample:temperature':
			return Math.round((18 + 12 * Math.sin(t / 60) + noise(t, 3, 22)) * 10) / 10;
		case 'sample:battery':
			return (
				Math.round(clamp(4.2 - ((t % 3600) / 3600) * 0.4 + noise(t, 0.02, 23), 3.6, 4.25) * 100) /
				100
			);
		case 'sample:sine':
			return Math.sin(t / 45) * 32 + 50 + noise(t, 3, 24);
		case 'sample:random':
			return clamp(50 + noise(t, 25, 25) + noise(t, 12, 26), 0, 100);
		case 'sample:step': {
			const step = (Math.floor(t / 120) % 6) * 18 + 5;
			return clamp(step + noise(t, 2, 27), 0, 100);
		}
		case 'sample:gps':
			return getSampleGpsPoint(t).alt;
		case 'sample:angle':
			// Sweeps 0→360° in ~120 seconds, continuously
			return (t * 3) % 360;
		default:
			return 0;
	}
}

export interface SampleSeriesOptions {
	/** Number of points to generate (default 60). */
	points?: number;
	/** Time window in seconds; end = now, start = now - windowSec (default 60). */
	windowSec?: number;
}

/** Time-series for charts. Points in recent window. */
export function getSampleStreamSeries(
	streamId: string,
	options: SampleSeriesOptions = {}
): { timestamp: number; value: number }[] {
	const now = Date.now() / 1000;
	const windowSec = options.windowSec ?? 60;
	const points = options.points ?? Math.min(60, Math.max(10, Math.floor(windowSec)));
	const step = windowSec / (points - 1 || 1);
	const data: { timestamp: number; value: number }[] = [];

	for (let i = 0; i < points; i++) {
		const ts = now - windowSec + i * step;
		const { altitude, velocity, phase } = flightPhase(ts);
		let value: number;

		switch (streamId) {
			case 'sample:altitude':
				value = Math.round(altitude * 10) / 10;
				break;
			case 'sample:velocity':
				value = Math.round(velocity * 10) / 10;
				break;
			case 'sample:accel_z': {
				const isBoost = phase >= 10 && phase < 25;
				const base = isBoost ? 28 + noise(ts, 6, 20) : -9.81;
				value = Math.round((base + noise(ts, 2.5, 21)) * 10) / 10;
				break;
			}
			case 'sample:temperature':
				value = Math.round((18 + 12 * Math.sin(ts / 60) + noise(ts, 3, 22)) * 10) / 10;
				break;
			case 'sample:battery':
				value =
					Math.round(
						clamp(4.2 - ((ts % 3600) / 3600) * 0.4 + noise(ts, 0.02, 23), 3.6, 4.25) * 100
					) / 100;
				break;
			case 'sample:sine':
				value = Math.sin(ts / 45) * 32 + 50 + noise(ts, 3, 24);
				break;
			case 'sample:random':
				value = clamp(50 + noise(ts, 25, 25) + noise(ts, 12, 26), 0, 100);
				break;
			case 'sample:step': {
				const stepVal = (Math.floor(ts / 120) % 6) * 18 + 5;
				value = clamp(stepVal + noise(ts, 2, 27), 0, 100);
				break;
			}
			case 'sample:gps':
				value = getSampleGpsPoint(ts).alt;
				break;
			case 'sample:angle':
				value = (ts * 3) % 360;
				break;
			default:
				value = 0;
		}
		data.push({ timestamp: ts, value });
	}
	return data;
}

/** GPS series for map components — returns lat/lon/alt track over a time window. */
export function getSampleGpsSeries(
	options: SampleSeriesOptions = {}
): { timestamp: number; lat: number; lon: number; alt: number }[] {
	const now = Date.now() / 1000;
	const windowSec = options.windowSec ?? 300;
	const points = options.points ?? Math.min(120, Math.max(20, Math.floor(windowSec / 2)));
	const step = windowSec / (points - 1 || 1);
	const data: { timestamp: number; lat: number; lon: number; alt: number }[] = [];

	for (let i = 0; i < points; i++) {
		const ts = now - windowSec + i * step;
		const pt = getSampleGpsPoint(ts);
		data.push({ timestamp: ts, ...pt });
	}
	return data;
}
