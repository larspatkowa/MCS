import { BadRequestError } from './errors.js';
import * as runsDb from './runs-db.js';
import * as streamsDb from './streams-db.js';
import { createHash } from 'node:crypto';

/** A deliberately boring interchange format: timestamps plus JSON-like values. */
export type RunImportFormat = 'csv' | 'ndjson' | 'json';
export type TimestampUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'auto';

export const MAX_RUN_IMPORT_BYTES = 200 * 1024 * 1024;
export const MAX_RUN_IMPORT_RECORDS = 1_000_000;

export interface RunImportOptions {
	format?: RunImportFormat;
	streamId?: string;
	timestampUnit?: TimestampUnit;
	metadata?: Record<string, unknown>;
	sourceName?: string;
}

export interface RunImportResult {
	run: runsDb.Run;
	format: RunImportFormat;
	streams: string[];
	samples: number;
	firstTimestamp: number | null;
	lastTimestamp: number | null;
	skipped: number;
}

type JsonObject = Record<string, unknown>;

interface ImportedStreamMetadata {
	id: string;
	name: string;
	metadata: JsonObject;
}

interface ParsedRunData {
	samples: runsDb.RecordedSample[];
	skipped: number;
	streams: ImportedStreamMetadata[];
	runMetadata?: JsonObject;
}

function isObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string' || value.trim() === '') return null;
	const parsed = Number(value.trim());
	return Number.isFinite(parsed) ? parsed : null;
}

function parseValue(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;
	const number = Number(trimmed);
	if (Number.isFinite(number)) return number;
	return value;
}

function normalizeTimestamp(value: unknown, unit: TimestampUnit): number {
	let timestamp = finiteNumber(value);
	if (timestamp === null && typeof value === 'string') {
		const parsedDate = Date.parse(value);
		if (Number.isFinite(parsedDate)) timestamp = parsedDate / 1000;
	}
	if (timestamp === null)
		throw new BadRequestError('Every imported sample needs a finite timestamp');
	const effectiveUnit =
		unit === 'auto'
			? Math.abs(timestamp) >= 1e14
				? 'microseconds'
				: Math.abs(timestamp) >= 1e11
					? 'milliseconds'
					: 'seconds'
			: unit;
	if (effectiveUnit === 'milliseconds') timestamp /= 1_000;
	if (effectiveUnit === 'microseconds') timestamp /= 1_000_000;
	if (!Number.isFinite(timestamp))
		throw new BadRequestError('Imported timestamp is outside the supported range');
	return timestamp;
}

function splitCsvLine(line: string, lineNumber: number): string[] {
	const cells: string[] = [];
	let cell = '';
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === '"') {
			if (quoted && line[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else {
				quoted = !quoted;
			}
		} else if (character === ',' && !quoted) {
			cells.push(cell);
			cell = '';
		} else {
			cell += character;
		}
	}
	if (quoted) throw new BadRequestError(`CSV line ${lineNumber} has an unterminated quoted field`);
	cells.push(cell);
	return cells;
}

function parseCsv(text: string, options: RunImportOptions): ParsedRunData {
	const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
	if (lines.length < 2) throw new BadRequestError('CSV import needs a header and at least one row');
	const headers = splitCsvLine(lines[0], 1).map((header) => header.trim());
	if (headers.some((header) => !header)) throw new BadRequestError('CSV headers cannot be empty');
	const normalizedHeaders = headers.map((header) => header.toLowerCase());
	const timestampIndex = normalizedHeaders.findIndex((header) =>
		['timestamp', 'ts', 'time', 't'].includes(header)
	);
	if (timestampIndex < 0)
		throw new BadRequestError('CSV must contain a timestamp, ts, time, or t column');
	const streamIndex = normalizedHeaders.findIndex((header) =>
		['streamid', 'stream_id', 'stream', 'channel'].includes(header)
	);
	const valueIndex = normalizedHeaders.findIndex((header) =>
		['value', 'values', 'payload'].includes(header)
	);
	const kindIndex = normalizedHeaders.indexOf('kind');
	const reserved = new Set([
		'timestamp',
		'ts',
		'time',
		't',
		'streamid',
		'stream_id',
		'stream',
		'channel',
		'kind',
		'provenance'
	]);
	const samples: runsDb.RecordedSample[] = [];
	let skipped = 0;
	for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
		if (samples.length >= MAX_RUN_IMPORT_RECORDS)
			throw new BadRequestError(`Import exceeds ${MAX_RUN_IMPORT_RECORDS} samples`);
		const cells = splitCsvLine(lines[lineIndex], lineIndex + 1);
		if (cells.length > headers.length)
			throw new BadRequestError(`CSV line ${lineIndex + 1} has too many fields`);
		const row = new Map(headers.map((header, index) => [header, cells[index] ?? '']));
		const timestamp = normalizeTimestamp(cells[timestampIndex], options.timestampUnit ?? 'auto');
		const streamId = (
			streamIndex >= 0 ? cells[streamIndex] : (options.streamId ?? 'imported')
		).trim();
		if (!streamId) {
			skipped += 1;
			continue;
		}
		let values: JsonObject = {};
		if (valueIndex >= 0 && ['values', 'payload'].includes(normalizedHeaders[valueIndex])) {
			const raw = cells[valueIndex]?.trim() ?? '';
			if (raw) {
				try {
					const parsed = JSON.parse(raw);
					if (isObject(parsed)) values = parsed;
				} catch {
					values = { value: parseValue(raw) };
				}
			}
		} else if (valueIndex >= 0) {
			values = { value: parseValue(cells[valueIndex]) };
		}
		if (Object.keys(values).length === 0) {
			for (let index = 0; index < headers.length; index += 1) {
				if (
					index === timestampIndex ||
					(streamIndex >= 0 && index === streamIndex) ||
					reserved.has(normalizedHeaders[index])
				)
					continue;
				values[headers[index]] = parseValue(cells[index]);
			}
		}
		if (Object.keys(values).length === 0) {
			skipped += 1;
			continue;
		}
		const kindValue = kindIndex >= 0 ? row.get(headers[kindIndex]) : undefined;
		samples.push({
			streamId,
			timestamp,
			values,
			kind: kindValue === 'derived' ? 'derived' : 'raw'
		});
	}
	return { samples, skipped, streams: [] };
}

function timestampFromObject(record: JsonObject): unknown {
	return record.timestamp ?? record.ts ?? record.time ?? record.t;
}

function valuesFromObject(record: JsonObject): JsonObject {
	if (isObject(record.values)) return record.values;
	if (isObject(record.payload)) return record.payload;
	if ('value' in record) return { value: record.value };
	const reserved = new Set([
		'type',
		'timestamp',
		'ts',
		'time',
		't',
		'streamId',
		'stream_id',
		'stream',
		'channel',
		'kind',
		'provenance',
		'createdAt'
	]);
	return Object.fromEntries(Object.entries(record).filter(([key]) => !reserved.has(key)));
}

function parseNdjson(text: string, options: RunImportOptions): ParsedRunData {
	const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
	if (lines.length === 0) throw new BadRequestError('NDJSON import is empty');
	const samples: runsDb.RecordedSample[] = [];
	const streams = new Map<string, ImportedStreamMetadata>();
	let runMetadata: JsonObject | undefined;
	let packageMode = false;
	let packageHash: ReturnType<typeof createHash> | null = null;
	let packageExpectedHash: string | null = null;
	let packageExpectedRecords: number | null = null;
	let skipped = 0;
	const appendSamples = (incoming: runsDb.RecordedSample[]): void => {
		if (samples.length + incoming.length > MAX_RUN_IMPORT_RECORDS) {
			throw new BadRequestError(`Import exceeds ${MAX_RUN_IMPORT_RECORDS} samples`);
		}
		samples.push(...incoming);
	};
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		if (samples.length >= MAX_RUN_IMPORT_RECORDS)
			throw new BadRequestError(`Import exceeds ${MAX_RUN_IMPORT_RECORDS} samples`);
		let parsed: unknown;
		try {
			parsed = JSON.parse(lines[lineIndex]);
		} catch {
			throw new BadRequestError(`Invalid JSON on line ${lineIndex + 1}`);
		}
		if (!isObject(parsed)) {
			skipped += 1;
			continue;
		}
		if (parsed.type === 'mcs-run-package') {
			if (parsed.version !== 1) throw new BadRequestError('Unsupported run package version');
			packageMode = true;
			packageHash = createHash('sha256');
			if (isObject(parsed.run) && isObject(parsed.run.metadata)) runMetadata = parsed.run.metadata;
			if (Array.isArray(parsed.streams)) {
				for (const stream of parsed.streams) {
					if (!isObject(stream) || typeof stream.id !== 'string' || !stream.id.trim()) continue;
					streams.set(stream.id, {
						id: stream.id,
						name: typeof stream.name === 'string' && stream.name.trim() ? stream.name : stream.id,
						metadata: isObject(stream.metadata) ? stream.metadata : {}
					});
				}
			}
			skipped += 1;
			continue;
		}
		if (parsed.type === 'stream') {
			if (typeof parsed.id === 'string' && parsed.id.trim()) {
				streams.set(parsed.id, {
					id: parsed.id,
					name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : parsed.id,
					metadata: isObject(parsed.metadata) ? parsed.metadata : {}
				});
			}
			skipped += 1;
			continue;
		}
		if (parsed.type === 'integrity') {
			if (packageMode && parsed.algorithm === 'sha256' && parsed.scope === 'sample-records') {
				packageExpectedHash = typeof parsed.sha256 === 'string' ? parsed.sha256 : null;
				packageExpectedRecords = typeof parsed.records === 'number' ? parsed.records : null;
			}
			skipped += 1;
			continue;
		}
		if (packageMode && parsed.type === 'sample') {
			packageHash?.update(`${lines[lineIndex]}\n`);
		}
		if (Array.isArray(parsed.samples)) {
			for (const nested of parsed.samples) {
				if (isObject(nested)) {
					const result = parseNdjson(`${JSON.stringify(nested)}\n`, options);
					appendSamples(result.samples);
					for (const stream of result.streams) streams.set(stream.id, stream);
					skipped += result.skipped;
				}
			}
			continue;
		}
		if (
			parsed.type === 'run' ||
			parsed.type === 'health' ||
			parsed.type === 'media' ||
			parsed.type === 'annotation'
		) {
			skipped += 1;
			continue;
		}
		const timestampRaw = timestampFromObject(parsed);
		if (timestampRaw !== undefined && isObject(parsed.streams)) {
			for (const [streamId, value] of Object.entries(parsed.streams)) {
				const timestamp = normalizeTimestamp(
					timestampFromObject(parsed),
					options.timestampUnit ?? 'auto'
				);
				appendSamples([
					{ streamId, timestamp, values: isObject(value) ? value : { value }, kind: 'raw' }
				]);
			}
			continue;
		}
		if (timestampRaw === undefined) {
			skipped += 1;
			continue;
		}
		const streamId = String(
			parsed.streamId ??
				parsed.stream_id ??
				parsed.stream ??
				parsed.channel ??
				options.streamId ??
				'imported'
		).trim();
		if (!streamId) {
			skipped += 1;
			continue;
		}
		const values = valuesFromObject(parsed);
		if (Object.keys(values).length === 0) {
			skipped += 1;
			continue;
		}
		appendSamples([
			{
				streamId,
				timestamp: normalizeTimestamp(timestampRaw, options.timestampUnit ?? 'auto'),
				values,
				kind: parsed.kind === 'derived' ? 'derived' : 'raw',
				provenance: isObject(parsed.provenance) ? parsed.provenance : undefined
			}
		]);
	}
	if (packageMode) {
		if (!packageExpectedHash || !packageHash || packageExpectedRecords === null) {
			throw new BadRequestError('Run package is missing its integrity record');
		}
		if (packageExpectedRecords !== samples.length) {
			throw new BadRequestError('Run package sample count does not match its integrity record');
		}
		if (packageHash.digest('hex') !== packageExpectedHash) {
			throw new BadRequestError('Run package integrity check failed');
		}
	}
	return { samples, skipped, streams: [...streams.values()], runMetadata };
}

function inferFormat(
	sourceName: string | undefined,
	text: string,
	requested?: RunImportFormat
): RunImportFormat {
	if (requested) return requested;
	const extension = sourceName?.toLowerCase().split('.').at(-1);
	if (extension === 'csv') return 'csv';
	if (extension === 'json') return 'json';
	if (extension === 'ndjson' || extension === 'jsonl') return 'ndjson';
	return text.trimStart().startsWith('[') || text.trimStart().startsWith('{') ? 'ndjson' : 'csv';
}

export function importRun(
	projectPath: string,
	text: string,
	options: RunImportOptions = {}
): RunImportResult {
	if (Buffer.byteLength(text, 'utf8') > MAX_RUN_IMPORT_BYTES)
		throw new BadRequestError('Run import is larger than 200 MB');
	const format = inferFormat(options.sourceName, text, options.format);
	const parsed =
		format === 'csv'
			? parseCsv(text, options)
			: parseNdjson(format === 'json' ? normalizeJsonInput(text) : text, options);
	if (parsed.samples.length === 0)
		throw new BadRequestError('Run import did not contain any samples');
	const streams = [...new Set(parsed.samples.map((sample) => sample.streamId))].sort();
	for (const stream of parsed.streams) {
		streamsDb.ensureStream(projectPath, stream.id, stream.name);
		streamsDb.updateStreamMetadata(projectPath, stream.id, stream.metadata, stream.name);
	}
	for (const streamId of streams) streamsDb.ensureStream(projectPath, streamId);
	let run: runsDb.Run | null = null;
	try {
		const timestamps = parsed.samples.map((sample) => sample.timestamp);
		const metadata = {
			...(options.metadata ?? {}),
			...(parsed.runMetadata ? { sourceRunMetadata: parsed.runMetadata } : {}),
			imported: true,
			format,
			sourceName: options.sourceName ?? null,
			timelineStart: Math.min(...timestamps),
			timelineEnd: Math.max(...timestamps)
		};
		run = runsDb.startRun(projectPath, metadata);
		runsDb.appendRunSamples(projectPath, run.id, parsed.samples);
		run = runsDb.stopRun(projectPath, run.id);
		return {
			run,
			format,
			streams,
			samples: parsed.samples.length,
			firstTimestamp: Math.min(...timestamps),
			lastTimestamp: Math.max(...timestamps),
			skipped: parsed.skipped
		};
	} catch (error) {
		if (run) runsDb.discardRun(projectPath, run.id);
		throw error;
	}
}

function normalizeJsonInput(text: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new BadRequestError('JSON import is invalid JSON');
	}
	if (Array.isArray(parsed)) return parsed.map((value) => JSON.stringify(value)).join('\n');
	if (isObject(parsed) && Array.isArray(parsed.samples))
		return parsed.samples.map((value) => JSON.stringify(value)).join('\n');
	if (isObject(parsed)) return JSON.stringify(parsed);
	throw new BadRequestError('JSON import must contain an object or samples array');
}
