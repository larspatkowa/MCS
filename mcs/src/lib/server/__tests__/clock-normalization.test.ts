import { describe, expect, it } from 'vitest';
import {
	normalizeSourceTime,
	registerSourceTimeAdapter,
	sourceTimeAdapterFor
} from '../clock-normalization.js';

describe('source clock normalization', () => {
	it('aligns independent sources using their configured offsets', () => {
		const first = normalizeSourceTime(100, 'seconds', {
			timeSystem: 'unix-utc',
			offsetSeconds: 2,
			uncertaintySeconds: 0.005
		});
		const second = normalizeSourceTime(100_000, 'milliseconds', {
			timeSystem: 'UTC',
			offsetSeconds: -3
		});

		expect(first.eventTimeUtc).toBe(102);
		expect(second.eventTimeUtc).toBe(97);
		expect(first.quality.clockQuality).toBe('excellent');
		expect(second.quality.clockQuality).toBe('unknown');
	});

	it('applies drift relative to the configured source reference', () => {
		const normalized = normalizeSourceTime(2_000_000, 'milliseconds', {
			timeSystem: 'unix-utc',
			driftPpm: 20,
			referenceSourceSeconds: 1_000,
			uncertaintySeconds: 0.5
		});

		expect(normalized.eventTimeUtc).toBe(2000.02);
		expect(normalized.quality.provenance.driftCorrectionSeconds).toBeCloseTo(0.02);
		expect(normalized.quality.clockQuality).toBe('good');
	});

	it('preserves the exact original timestamp and conversion provenance', () => {
		const normalized = normalizeSourceTime(1_700_000_000_123, 'nanoseconds', {
			timeSystem: 'unix-utc',
			offsetSeconds: 1.25
		});

		expect(normalized.sourceTimestamp).toBe(1_700_000_000_123);
		expect(normalized.sourceTimestampUnit).toBe('nanoseconds');
		expect(normalized.eventTimeUtc).toBeCloseTo(1700.000000123 + 1.25);
		expect(normalized.quality.provenance).toMatchObject({
			offsetSeconds: 1.25,
			driftPpm: 0,
			timeSystemConversion: 'unix-utc'
		});
	});

	it('aligns UTC, GPS, and TAI time systems while preserving each declared time scale', () => {
		const utc = Date.parse('2020-01-01T00:00:00Z') / 1000;
		const gpsSeconds = utc - 315_964_800 + 18;
		const taiSeconds = utc + 37;
		const gps = normalizeSourceTime(gpsSeconds, 'seconds', { timeSystem: 'GPS' });
		const tai = normalizeSourceTime(taiSeconds, 'seconds', { timeSystem: 'TAI' });

		expect(gps.eventTimeUtc).toBe(utc);
		expect(tai.eventTimeUtc).toBe(utc);
		expect(gps.sourceTimestamp).toBe(gpsSeconds);
		expect(tai.sourceTimestamp).toBe(taiSeconds);
		expect(gps.quality.provenance.timeSystemConversion).toBe('gps');
		expect(tai.quality.provenance.timeSystemConversion).toBe('tai');
	});

	it('rejects invalid values, units, and unsupported time systems without an adapter', () => {
		expect(() => normalizeSourceTime(Number.NaN, 'seconds', { timeSystem: 'UTC' })).toThrow(
			/sourceTimestamp must be finite/
		);
		expect(() => normalizeSourceTime(10, 'fortnights' as never, { timeSystem: 'UTC' })).toThrow(
			/Unsupported timestamp unit/
		);
		expect(() => normalizeSourceTime(10, 'seconds', { timeSystem: 'MARS' })).toThrow(
			/Unsupported time system/
		);
		expect(() => normalizeSourceTime(10, 'seconds', { timeSystem: 'TAI' })).toThrow(
			/TAI\/GPS conversion before 1972/
		);
		expect(() =>
			normalizeSourceTime(10, 'seconds', { timeSystem: 'unix-utc', driftPpm: Infinity })
		).toThrow(/driftPpm must be finite/);
	});

	it('uses a supplied adapter for a custom source time system', () => {
		const normalized = normalizeSourceTime(10, 'seconds', {
			timeSystem: 'custom-epoch',
			adapter: { name: 'custom-epoch-test', toUnixUtcSeconds: (seconds) => seconds + 20 }
		});

		expect(normalized.eventTimeUtc).toBe(30);
		expect(normalized.quality.provenance).toMatchObject({
			adapter: 'custom-epoch-test',
			timeSystemConversion: 'adapter'
		});
	});

	it('registers trusted custom adapters for the ingest boundary', () => {
		const adapter = {
			name: 'custom-epoch-test',
			toUnixUtcSeconds: (seconds: number) => seconds + 20
		};
		const unregister = registerSourceTimeAdapter('custom-epoch', adapter);
		try {
			expect(sourceTimeAdapterFor('CUSTOM-EPOCH')).toBe(adapter);
			expect(
				normalizeSourceTime(10, 'seconds', {
					timeSystem: 'custom-epoch',
					adapter: sourceTimeAdapterFor('custom-epoch')
				}).eventTimeUtc
			).toBe(30);
		} finally {
			unregister();
		}
		expect(sourceTimeAdapterFor('custom-epoch')).toBeUndefined();
		expect(() => registerSourceTimeAdapter('UTC', adapter)).toThrow(/cannot be overridden/);
	});
});
