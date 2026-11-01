/**
 * Small, deterministic derived-value pipeline.
 *
 * Raw supplier samples stay untouched. A caller may apply this pipeline to a
 * copy of a numeric series and persist the result as a separate `derived`
 * stream with this definition as provenance. There is intentionally no
 * expression evaluator, callback, or user supplied code in this module.
 */

export interface NumericSample {
	timestamp: number;
	value: number;
}

export type DerivedOperation =
	| { op: 'scale'; factor: number }
	| { op: 'offset'; amount: number }
	| { op: 'logarithm'; base?: number }
	| { op: 'clamp'; min: number; max: number }
	| { op: 'derivative' }
	| { op: 'integral'; initial?: number }
	| { op: 'movingAverage'; window: number }
	| { op: 'min' | 'max'; window: number }
	| { op: 'resample'; interval: number; method?: 'linear' | 'previous' }
	| { op: 'align'; tolerance: number };

export interface DerivedTransformDefinition {
	version: 1;
	operations: DerivedOperation[];
}

export interface DerivedTransformResult {
	samples: NumericSample[];
	skipped: number;
	warnings: string[];
}

const MAX_OPERATIONS = 16;
const MAX_WINDOW = 4096;
const MAX_SAMPLES = 1_000_000;

function finite(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error(`${label} must be finite`);
	}
	return value;
}

function positive(value: unknown, label: string): number {
	const number = finite(value, label);
	if (number <= 0) throw new Error(`${label} must be greater than zero`);
	return number;
}

function integer(value: unknown, label: string, min = 1, max = MAX_WINDOW): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
		throw new Error(`${label} must be an integer from ${min} to ${max}`);
	}
	return value;
}

/** Validate and canonicalize a JSON-compatible transform definition. */
export function validateTransformDefinition(input: unknown): DerivedTransformDefinition {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error('transform must be an object');
	}
	const value = input as { version?: unknown; operations?: unknown };
	if (value.version !== 1) throw new Error('transform version must be 1');
	if (!Array.isArray(value.operations) || value.operations.length > MAX_OPERATIONS) {
		throw new Error(`transform operations must contain 0-${MAX_OPERATIONS} items`);
	}
	const operations: DerivedOperation[] = value.operations.map((raw, index) => {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			throw new Error(`operation ${index + 1} must be an object`);
		}
		const operation = raw as Record<string, unknown>;
		if (typeof operation.op !== 'string') throw new Error(`operation ${index + 1} is missing op`);
		switch (operation.op) {
			case 'scale':
				return { op: 'scale', factor: finite(operation.factor, `operation ${index + 1} factor`) };
			case 'offset':
				return { op: 'offset', amount: finite(operation.amount, `operation ${index + 1} amount`) };
			case 'logarithm': {
				const base =
					operation.base === undefined
						? 10
						: positive(operation.base, `operation ${index + 1} base`);
				if (base === 1) throw new Error(`operation ${index + 1} base cannot be 1`);
				return { op: 'logarithm', base };
			}
			case 'clamp': {
				const min = finite(operation.min, `operation ${index + 1} min`);
				const max = finite(operation.max, `operation ${index + 1} max`);
				if (min > max) throw new Error(`operation ${index + 1} min cannot exceed max`);
				return { op: 'clamp', min, max };
			}
			case 'derivative':
				return { op: 'derivative' };
			case 'integral':
				return {
					op: 'integral',
					...(operation.initial === undefined
						? {}
						: { initial: finite(operation.initial, `operation ${index + 1} initial`) })
				};
			case 'movingAverage':
				return {
					op: 'movingAverage',
					window: integer(operation.window, `operation ${index + 1} window`)
				};
			case 'min':
			case 'max':
				return {
					op: operation.op,
					window: integer(operation.window, `operation ${index + 1} window`)
				};
			case 'resample': {
				const method = operation.method === undefined ? 'linear' : operation.method;
				if (method !== 'linear' && method !== 'previous') {
					throw new Error(`operation ${index + 1} method must be linear or previous`);
				}
				return {
					op: 'resample',
					interval: positive(operation.interval, `operation ${index + 1} interval`),
					method
				};
			}
			case 'align':
				return {
					op: 'align',
					tolerance: positive(operation.tolerance, `operation ${index + 1} tolerance`)
				};
			default:
				throw new Error(`operation ${index + 1} is not supported`);
		}
	});
	return { version: 1, operations };
}

/** Parse a compact, deliberately limited form such as `scale(2) | clamp(0, 10)`. */
export function parseTransformText(source: string): DerivedTransformDefinition {
	if (typeof source !== 'string' || source.length > 4096)
		throw new Error('transform text is invalid');
	const text = source.trim();
	if (!text) return { version: 1, operations: [] };
	const operations = text.split('|').map((part, index) => {
		const match = part.trim().match(/^([A-Za-z][A-Za-z0-9]*)\s*\(([^()]*)\)$/);
		if (!match) throw new Error(`invalid transform operation ${index + 1}`);
		const name = match[1];
		const args = match[2].trim()
			? match[2].split(',').map((item) => {
					const value = Number(item.trim());
					if (!Number.isFinite(value))
						throw new Error(`invalid numeric argument in operation ${index + 1}`);
					return value;
				})
			: [];
		switch (name) {
			case 'scale':
				if (args.length !== 1) throw new Error('scale expects one argument');
				return { op: 'scale', factor: args[0] };
			case 'offset':
				if (args.length !== 1) throw new Error('offset expects one argument');
				return { op: 'offset', amount: args[0] };
			case 'log':
			case 'logarithm':
				if (args.length > 1) throw new Error('logarithm expects zero or one argument');
				return { op: 'logarithm', ...(args.length ? { base: args[0] } : {}) };
			case 'clamp':
				if (args.length !== 2) throw new Error('clamp expects two arguments');
				return { op: 'clamp', min: args[0], max: args[1] };
			case 'derivative':
				if (args.length) throw new Error('derivative expects no arguments');
				return { op: 'derivative' };
			case 'integral':
				if (args.length > 1) throw new Error('integral expects zero or one argument');
				return { op: 'integral', ...(args.length ? { initial: args[0] } : {}) };
			case 'movingAverage':
			case 'average':
				if (args.length !== 1) throw new Error('movingAverage expects one argument');
				return { op: 'movingAverage', window: args[0] };
			case 'min':
			case 'max':
				if (args.length !== 1) throw new Error(`${name} expects one argument`);
				return { op: name, window: args[0] };
			case 'resample':
				if (args.length !== 1) throw new Error('resample expects one argument');
				return { op: 'resample', interval: args[0] };
			case 'align':
				if (args.length !== 1) throw new Error('align expects one argument');
				return { op: 'align', tolerance: args[0] };
			default:
				throw new Error(`operation ${name} is not supported`);
		}
	});
	return validateTransformDefinition({ version: 1, operations });
}

function normalizeSamples(samples: readonly NumericSample[]): {
	samples: NumericSample[];
	skipped: number;
	warnings: string[];
} {
	if (samples.length > MAX_SAMPLES) throw new Error(`sample count exceeds ${MAX_SAMPLES}`);
	let skipped = 0;
	const valid = samples.flatMap((sample) => {
		if (!sample || !Number.isFinite(sample.timestamp) || !Number.isFinite(sample.value)) {
			skipped += 1;
			return [];
		}
		return [{ timestamp: sample.timestamp, value: sample.value }];
	});
	// Stable ordering is part of the transform contract. Array index is the
	// tie-breaker when suppliers emit equal timestamps.
	const ordered = valid
		.map((sample, index) => ({ sample, index }))
		.sort((a, b) => a.sample.timestamp - b.sample.timestamp || a.index - b.index)
		.map(({ sample }) => sample);
	return {
		samples: ordered,
		skipped,
		warnings: skipped ? [`Skipped ${skipped} invalid source sample${skipped === 1 ? '' : 's'}`] : []
	};
}

function mapFinite(
	samples: NumericSample[],
	fn: (value: number, sample: NumericSample, index: number) => number
): NumericSample[] {
	return samples.flatMap((sample, index) => {
		const value = fn(sample.value, sample, index);
		return Number.isFinite(value) ? [{ timestamp: sample.timestamp, value }] : [];
	});
}

function applyOperation(samples: NumericSample[], operation: DerivedOperation): NumericSample[] {
	switch (operation.op) {
		case 'scale':
			return mapFinite(samples, (value) => value * operation.factor);
		case 'offset':
			return mapFinite(samples, (value) => value + operation.amount);
		case 'logarithm': {
			const denominator = Math.log(operation.base ?? 10);
			return mapFinite(samples, (value) =>
				value > 0 ? Math.log(value) / denominator : Number.NaN
			);
		}
		case 'clamp':
			return mapFinite(samples, (value) => Math.max(operation.min, Math.min(operation.max, value)));
		case 'derivative':
			return samples.map((sample, index) => {
				if (index === 0) return { timestamp: sample.timestamp, value: 0 };
				const previous = samples[index - 1];
				const dt = sample.timestamp - previous.timestamp;
				return {
					timestamp: sample.timestamp,
					value: dt > 0 ? (sample.value - previous.value) / dt : 0
				};
			});
		case 'integral': {
			let total = operation.initial ?? 0;
			return samples.map((sample, index) => {
				if (index > 0) {
					const previous = samples[index - 1];
					const dt = sample.timestamp - previous.timestamp;
					if (dt > 0) total += ((previous.value + sample.value) / 2) * dt;
				}
				return { timestamp: sample.timestamp, value: total };
			});
		}
		case 'movingAverage':
		case 'min':
		case 'max': {
			const output: NumericSample[] = [];
			for (let index = 0; index < samples.length; index += 1) {
				const window = samples
					.slice(Math.max(0, index - operation.window + 1), index + 1)
					.map((sample) => sample.value);
				const value =
					operation.op === 'movingAverage'
						? window.reduce((sum, item) => sum + item, 0) / window.length
						: operation.op === 'min'
							? Math.min(...window)
							: Math.max(...window);
				output.push({ timestamp: samples[index].timestamp, value });
			}
			return output;
		}
		case 'align': {
			if (samples.length < 2) return samples;
			const output: NumericSample[] = [];
			for (const sample of samples) {
				const previous = output.at(-1);
				if (previous && sample.timestamp - previous.timestamp <= operation.tolerance) {
					// Keep the first sample's position and use the deterministic mean.
					previous.value = (previous.value + sample.value) / 2;
				} else output.push({ ...sample });
			}
			return output;
		}
		case 'resample': {
			if (samples.length < 2) return samples;
			const start = samples[0].timestamp;
			const end = samples.at(-1)!.timestamp;
			const outputCount = Math.floor((end - start) / operation.interval) + 1;
			if (!Number.isSafeInteger(outputCount) || outputCount > MAX_SAMPLES) {
				throw new Error(`resample output exceeds ${MAX_SAMPLES} samples`);
			}
			const output: NumericSample[] = [];
			let sourceIndex = 0;
			for (
				let timestamp = start;
				timestamp <= end + operation.interval * 1e-9;
				timestamp += operation.interval
			) {
				while (sourceIndex + 1 < samples.length && samples[sourceIndex + 1].timestamp < timestamp)
					sourceIndex += 1;
				const left = samples[sourceIndex];
				const right = samples[Math.min(sourceIndex + 1, samples.length - 1)];
				let value = left.value;
				if (
					operation.method !== 'previous' &&
					right.timestamp > left.timestamp &&
					timestamp > left.timestamp
				) {
					const ratio = (timestamp - left.timestamp) / (right.timestamp - left.timestamp);
					value = left.value + (right.value - left.value) * Math.max(0, Math.min(1, ratio));
				}
				output.push({ timestamp: Math.min(timestamp, end), value });
			}
			return output;
		}
	}
}

/** Apply a validated deterministic pipeline to a numeric copy of raw samples. */
export function applyDerivedTransform(
	samples: readonly NumericSample[],
	definition: DerivedTransformDefinition | unknown
): DerivedTransformResult {
	const validated = validateTransformDefinition(definition);
	const normalized = normalizeSamples(samples);
	let current = normalized.samples;
	let skipped = normalized.skipped;
	const warnings = [...normalized.warnings];
	validated.operations.forEach((operation, index) => {
		const before = current.length;
		current = applyOperation(current, operation);
		if (current.length < before) {
			skipped += before - current.length;
			warnings.push(
				`Operation ${index + 1} dropped ${before - current.length} non-finite result${before - current.length === 1 ? '' : 's'}`
			);
		}
	});
	return { samples: current, skipped, warnings };
}
