export interface GenerateFunctionSeriesOptions {
	/** Inclusive unix-second window start. */
	start: number;
	/** Inclusive unix-second window end. */
	end: number;
	/** Number of points to generate (>= 2). */
	sampleCount: number;
}

export interface FunctionPoint {
	timestamp: number;
	value: number;
}

const SAFE_SCOPE = {
	abs: Math.abs,
	acos: Math.acos,
	asin: Math.asin,
	atan: Math.atan,
	atan2: Math.atan2,
	ceil: Math.ceil,
	cos: Math.cos,
	exp: Math.exp,
	floor: Math.floor,
	log: Math.log,
	max: Math.max,
	min: Math.min,
	pow: Math.pow,
	round: Math.round,
	sign: Math.sign,
	sin: Math.sin,
	sqrt: Math.sqrt,
	tan: Math.tan,
	pi: Math.PI,
	e: Math.E
} as const;

type CompiledExpression = (args: { t: number; time: number; i: number }) => number;

/**
 * Compile a user expression into a numeric function.
 * Expression variables:
 * t    -> seconds from start of current window
 * time -> unix timestamp (seconds)
 * i    -> sample index
 */
export function compileFunctionExpression(expression: string): CompiledExpression {
	const src = expression.trim();
	if (!src) {
		throw new Error('Expression is empty');
	}

	const names = Object.keys(SAFE_SCOPE);
	const values = Object.values(SAFE_SCOPE);
	const fn = new Function('t', 'time', 'i', ...names, `"use strict"; return (${src});`) as (
		...args: unknown[]
	) => unknown;

	return ({ t, time, i }) => {
		const result = fn(t, time, i, ...values);
		if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
			throw new Error('Expression did not return a finite number');
		}
		return result;
	};
}

export function generateFunctionSeries(
	expression: string,
	options: GenerateFunctionSeriesOptions
): FunctionPoint[] {
	const start = Number(options.start);
	const end = Number(options.end);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
		return [];
	}

	const sampleCount = Math.max(2, Math.floor(options.sampleCount));
	const span = end - start;
	const step = span / (sampleCount - 1);
	const evaluate = compileFunctionExpression(expression);

	const out: FunctionPoint[] = [];
	for (let i = 0; i < sampleCount; i += 1) {
		const timestamp = start + step * i;
		const t = timestamp - start;
		const value = evaluate({ t, time: timestamp, i });
		out.push({ timestamp, value });
	}
	return out;
}
