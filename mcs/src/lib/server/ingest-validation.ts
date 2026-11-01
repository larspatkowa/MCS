import { BadRequestError } from '$lib/server/errors.js';

/** Keep request parsing and the values stored in SQLite bounded. */
export const MAX_JSON_BODY_BYTES = 1_048_576;
export const MAX_BATCH_SIZE = 5_000;
export const MAX_VALUE_KEYS = 256;
export const MAX_VALUE_DEPTH = 6;
export const MAX_STRING_LENGTH = 16_384;

export interface ValidatedIngestSample {
	streamId: string;
	timestamp: number;
	values: Record<string, unknown>;
}

export interface ValidatedTelemetryEnvelope {
	version: 1;
	projectId: string;
	source: {
		id: string;
		name: string;
		timeSystem: string;
		timestampUnit: 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';
	};
	samples: {
		streamId: string;
		sourceTimestamp: {
			value: number | string;
			unit: 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';
			timeSystem: string;
		};
		sequence?: number;
		idempotencyKey?: string;
		values: Record<string, unknown>;
		quality?: Record<string, unknown>;
		provenance?: Record<string, unknown>;
	}[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateIdentifier(value: unknown, name: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new BadRequestError(`${name} is required`);
	}
	const normalized = value.trim();
	if (normalized.length > 200) throw new BadRequestError(`${name} is too long`);
	if (!/^[A-Za-z0-9][A-Za-z0-9:_.-]*$/.test(normalized)) {
		throw new BadRequestError(`${name} contains invalid characters`);
	}
	return normalized;
}

export function validateText(value: unknown, name: string, max = MAX_STRING_LENGTH): string {
	if (typeof value !== 'string') throw new BadRequestError(`${name} must be a string`);
	if (value.length > max) throw new BadRequestError(`${name} is too long`);
	return value;
}

function validateValueTree(value: unknown, path: string, depth: number): void {
	if (typeof value === 'string') {
		if (value.length > MAX_STRING_LENGTH) throw new BadRequestError(`${path} is too long`);
		return;
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new BadRequestError(`${path} must be finite`);
		return;
	}
	if (value === null || typeof value === 'boolean') return;
	if (depth >= MAX_VALUE_DEPTH) throw new BadRequestError(`${path} is nested too deeply`);
	if (Array.isArray(value)) {
		if (value.length > MAX_VALUE_KEYS) throw new BadRequestError(`${path} has too many items`);
		value.forEach((item, index) => validateValueTree(item, `${path}[${index}]`, depth + 1));
		return;
	}
	if (!isRecord(value)) throw new BadRequestError(`${path} contains an unsupported value`);
	const keys = Object.keys(value);
	if (keys.length > MAX_VALUE_KEYS) throw new BadRequestError(`${path} has too many fields`);
	for (const key of keys) {
		if (key.length > 200)
			throw new BadRequestError(`${path} contains a field name that is too long`);
		if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
			throw new BadRequestError(`${path} contains a reserved field`);
		}
		validateValueTree(value[key], `${path}.${key}`, depth + 1);
	}
}

export function validateValueObject(
	value: unknown,
	name: string
): asserts value is Record<string, unknown> {
	if (!isRecord(value)) throw new BadRequestError(`${name} must be an object`);
	validateValueTree(value, name, 0);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
	const contentLength = request.headers.get('content-length');
	if (contentLength !== null) {
		const parsedLength = Number(contentLength);
		if (!Number.isFinite(parsedLength) || parsedLength < 0) {
			throw new BadRequestError('Invalid content length');
		}
		if (parsedLength > MAX_JSON_BODY_BYTES) throw new BadRequestError('Request body is too large');
	}
	let text: string;
	try {
		text = await request.text();
	} catch {
		throw new BadRequestError('Unable to read request body');
	}
	if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
		throw new BadRequestError('Request body is too large');
	}
	let body: unknown;
	try {
		body = JSON.parse(text) as unknown;
	} catch {
		throw new BadRequestError('Invalid JSON body');
	}
	if (!isRecord(body)) throw new BadRequestError('JSON body must be an object');
	return body;
}

export function validateProjectId(value: unknown): string {
	return validateIdentifier(value, 'projectId');
}

export function validateSample(value: unknown, now = Date.now() / 1000): ValidatedIngestSample {
	if (!isRecord(value)) throw new BadRequestError('sample must be an object');
	const streamId = validateIdentifier(value.streamId, 'streamId');
	const timestamp = value.timestamp === undefined ? now : value.timestamp;
	if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
		throw new BadRequestError('timestamp must be a finite number');
	}
	const values = value.values === undefined ? {} : value.values;
	validateValueObject(values, 'values');
	return { streamId, timestamp, values };
}

export function validateBatchSize(value: unknown): asserts value is unknown[] {
	if (!Array.isArray(value)) throw new BadRequestError('samples must be an array');
	if (value.length > MAX_BATCH_SIZE) {
		throw new BadRequestError(`samples may contain at most ${MAX_BATCH_SIZE} items`);
	}
}

const TIMESTAMP_UNITS = ['seconds', 'milliseconds', 'microseconds', 'nanoseconds'] as const;

export function validateTelemetryEnvelope(value: unknown): ValidatedTelemetryEnvelope {
	if (!isRecord(value)) throw new BadRequestError('Telemetry envelope must be an object');
	if (value.version !== 1) throw new BadRequestError('Unsupported telemetry envelope version');
	const projectId = validateProjectId(value.projectId);
	if (!isRecord(value.source)) throw new BadRequestError('source must be an object');
	const sourceId = validateIdentifier(value.source.id, 'source.id');
	const sourceName =
		value.source.name === undefined
			? sourceId
			: validateText(value.source.name, 'source.name', 200);
	const sourceTimeSystem = validateTimeSystem(
		value.source.timeSystem ?? 'unix-utc',
		'source.timeSystem'
	);
	const sourceUnit = validateTimestampUnit(
		value.source.timestampUnit ?? 'seconds',
		'source.timestampUnit'
	);
	validateBatchSize(value.samples);
	const samples = value.samples.map((rawSample, index) => {
		if (!isRecord(rawSample)) throw new BadRequestError(`samples[${index}] must be an object`);
		const streamId = validateIdentifier(rawSample.streamId, `samples[${index}].streamId`);
		if (!isRecord(rawSample.sourceTimestamp))
			throw new BadRequestError(`samples[${index}].sourceTimestamp must be an object`);
		const rawTimestamp = validateTimestampValue(
			rawSample.sourceTimestamp.value,
			`samples[${index}].sourceTimestamp.value`
		);
		const timestampUnit = validateTimestampUnit(
			rawSample.sourceTimestamp.unit ?? sourceUnit,
			`samples[${index}].sourceTimestamp.unit`
		);
		const timeSystem = validateTimeSystem(
			rawSample.sourceTimestamp.timeSystem ?? sourceTimeSystem,
			`samples[${index}].sourceTimestamp.timeSystem`
		);
		let sequence: number | undefined;
		if (rawSample.sequence !== undefined) {
			if (
				typeof rawSample.sequence !== 'number' ||
				!Number.isSafeInteger(rawSample.sequence) ||
				rawSample.sequence < 0
			) {
				throw new BadRequestError(`samples[${index}].sequence must be a non-negative safe integer`);
			}
			sequence = Number(rawSample.sequence);
		}
		let idempotencyKey: string | undefined;
		if (rawSample.idempotencyKey !== undefined) {
			idempotencyKey = validateIdentifier(
				rawSample.idempotencyKey,
				`samples[${index}].idempotencyKey`
			);
		}
		const values = rawSample.values ?? {};
		validateValueObject(values, `samples[${index}].values`);
		const quality = rawSample.quality;
		if (quality !== undefined) {
			validateValueObject(quality, `samples[${index}].quality`);
			const clock = quality.clock ?? quality.clockQuality;
			if (
				clock !== undefined &&
				!['excellent', 'good', 'degraded', 'unknown'].includes(String(clock))
			) {
				throw new BadRequestError(`samples[${index}].quality.clock is unsupported`);
			}
			const uncertainty = quality.clockUncertaintySeconds;
			if (
				uncertainty !== undefined &&
				(typeof uncertainty !== 'number' || !Number.isFinite(uncertainty) || uncertainty < 0)
			) {
				throw new BadRequestError(
					`samples[${index}].quality.clockUncertaintySeconds must be non-negative and finite`
				);
			}
			if (
				quality.flags !== undefined &&
				(!Array.isArray(quality.flags) ||
					quality.flags.length > 128 ||
					quality.flags.some((flag) => typeof flag !== 'string' || flag.length > 200))
			) {
				throw new BadRequestError(
					`samples[${index}].quality.flags must be an array of short strings`
				);
			}
		}
		const provenance = rawSample.provenance;
		if (provenance !== undefined) validateValueObject(provenance, `samples[${index}].provenance`);
		return {
			streamId,
			sourceTimestamp: { value: rawTimestamp, unit: timestampUnit, timeSystem },
			...(sequence === undefined ? {} : { sequence }),
			...(idempotencyKey === undefined ? {} : { idempotencyKey }),
			values,
			...(quality === undefined ? {} : { quality }),
			...(provenance === undefined ? {} : { provenance })
		};
	});
	return {
		version: 1,
		projectId,
		source: {
			id: sourceId,
			name: sourceName,
			timeSystem: sourceTimeSystem,
			timestampUnit: sourceUnit
		},
		samples
	};
}

function validateTimestampUnit(
	value: unknown,
	name: string
): ValidatedTelemetryEnvelope['source']['timestampUnit'] {
	if (
		typeof value !== 'string' ||
		!TIMESTAMP_UNITS.includes(value as (typeof TIMESTAMP_UNITS)[number])
	) {
		throw new BadRequestError(`${name} is unsupported`);
	}
	return value as ValidatedTelemetryEnvelope['source']['timestampUnit'];
}

function validateTimestampValue(value: unknown, name: string): number | string {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (
		typeof value === 'string' &&
		value.length <= 80 &&
		value.trim() === value &&
		/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) &&
		Number.isFinite(Number(value))
	) {
		return value;
	}
	throw new BadRequestError(`${name} must be a finite number or numeric string`);
}

function validateTimeSystem(value: unknown, name: string): string {
	const system = validateText(value, name, 64).trim();
	if (!system) throw new BadRequestError(`${name} is required`);
	return system;
}
