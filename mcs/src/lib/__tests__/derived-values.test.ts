import { describe, expect, it } from 'vitest';
import {
	applyDerivedTransform,
	parseTransformText,
	validateTransformDefinition,
	type NumericSample
} from '../derived-values.js';

const source: NumericSample[] = [
	{ timestamp: 2, value: 4 },
	{ timestamp: 1, value: 2 },
	{ timestamp: 1, value: 6 },
	{ timestamp: 3, value: Number.NaN }
];

describe('derived values', () => {
	it('validates and applies only the supported deterministic operations', () => {
		const definition = parseTransformText('offset(1) | scale(2) | clamp(0, 10)');
		const result = applyDerivedTransform(source, definition);
		expect(result.samples).toEqual([
			{ timestamp: 1, value: 6 },
			{ timestamp: 1, value: 10 },
			{ timestamp: 2, value: 10 }
		]);
		expect(result.skipped).toBe(1);
	});

	it('keeps equal timestamp ordering stable and computes derivative/integral', () => {
		const result = applyDerivedTransform(
			[
				{ timestamp: 0, value: 0 },
				{ timestamp: 1, value: 2 },
				{ timestamp: 2, value: 4 }
			],
			{ version: 1, operations: [{ op: 'derivative' }] }
		);
		expect(result.samples.map((sample) => sample.value)).toEqual([0, 2, 2]);
		const integral = applyDerivedTransform(
			[
				{ timestamp: 0, value: 2 },
				{ timestamp: 1, value: 2 }
			],
			{ version: 1, operations: [{ op: 'integral' }] }
		);
		expect(integral.samples.at(-1)?.value).toBe(2);
	});

	it('rejects arbitrary or unsafe definitions', () => {
		expect(() =>
			validateTransformDefinition({ version: 1, operations: [{ op: 'arbitrary', source: 'x' }] })
		).toThrow(/not supported/);
		expect(() => parseTransformText('scale(Math.random())')).toThrow(
			/invalid transform operation|invalid numeric argument/
		);
	});
});
