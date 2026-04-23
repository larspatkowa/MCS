import { describe, expect, it } from 'vitest';
import { compileFunctionExpression, generateFunctionSeries } from '$lib/charts/function-series';

describe('function-series', () => {
	it('compiles and evaluates a valid expression', () => {
		const evaluate = compileFunctionExpression('50 + 10 * sin(t)');
		const value = evaluate({ t: 0, time: 1700000000, i: 0 });
		expect(value).toBeCloseTo(50, 5);
	});

	it('generates an ordered time-series', () => {
		const data = generateFunctionSeries('t * 2', {
			start: 100,
			end: 160,
			sampleCount: 4
		});
		expect(data).toHaveLength(4);
		expect(data[0]?.timestamp).toBe(100);
		expect(data[3]?.timestamp).toBe(160);
		expect(data[0]?.value).toBe(0);
		expect(data[3]?.value).toBe(120);
	});

	it('throws when expression is invalid', () => {
		expect(() => compileFunctionExpression('')).toThrowError();
		expect(() =>
			generateFunctionSeries('sin(', { start: 0, end: 10, sampleCount: 10 })
		).toThrowError();
	});
});
