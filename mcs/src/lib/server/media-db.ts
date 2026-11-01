import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { getDb } from './db.js';
import { BadRequestError, NotFoundError } from './errors.js';

const execFileAsync = promisify(execFile);
const MEDIA_DIR = join('.mcs', 'media');
/** Keep imports bounded so a multipart request cannot exhaust project storage. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const MAX_SYNC_ANCHORS = 4096;

export interface MediaAsset {
	id: string;
	contentHash: string;
	relativePath: string;
	sourceName: string;
	mimeType: string;
	byteSize: number;
	durationUs: number | null;
	width: number | null;
	height: number | null;
	fpsNum: number | null;
	fpsDen: number | null;
	audioChannels: number | null;
	audioSampleRate: number | null;
	metadata: Record<string, unknown>;
	createdAt: string;
}

export interface MediaSyncAnchor {
	id: string;
	bindingId: string;
	ordinal: number;
	mediaTimeUs: number;
	runTimeUs: number;
	label: string;
	createdAt: string;
}

export interface MediaBinding {
	id: string;
	assetId: string;
	runId: string;
	offsetUs: number;
	rate: number;
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	anchors: MediaSyncAnchor[];
}

/** The canonical media-track description consumed by replay and rendering. */
export interface MediaTrack {
	assetId: string;
	source: { kind: 'file'; relativePath: string } | { kind: 'stream'; url: string };
	mimeType: string;
	startUs: number;
	durationUs: number | null;
	syncOffsetUs: number;
	rate: number;
	fpsNum: number | null;
	fpsDen: number | null;
	audio: { channels: number | null; sampleRate: number | null };
}

export interface MediaFrameLookup {
	track: MediaTrack;
	replayTimeUs: number;
	mediaTimeUs: number;
	frameIndex: number | null;
	available: boolean;
}

function parseMetadata(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value || '{}');
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function rowToAsset(row: MediaAssetRow): MediaAsset {
	return {
		id: row.id,
		contentHash: row.content_hash,
		relativePath: row.relative_path,
		sourceName: row.source_name,
		mimeType: row.mime_type,
		byteSize: row.byte_size,
		durationUs: row.duration_us,
		width: row.width,
		height: row.height,
		fpsNum: row.fps_num,
		fpsDen: row.fps_den,
		audioChannels: row.audio_channels,
		audioSampleRate: row.audio_sample_rate,
		metadata: parseMetadata(row.metadata),
		createdAt: row.created_at
	};
}

function rowToAnchor(row: AnchorRow): MediaSyncAnchor {
	return {
		id: row.id,
		bindingId: row.binding_id,
		ordinal: row.ordinal,
		mediaTimeUs: row.media_time_us,
		runTimeUs: row.run_time_us,
		label: row.label,
		createdAt: row.created_at
	};
}

function rowToBinding(row: BindingRow, anchors: MediaSyncAnchor[] = []): MediaBinding {
	return {
		id: row.id,
		assetId: row.asset_id,
		runId: row.run_id,
		offsetUs: row.offset_us,
		rate: row.rate,
		metadata: parseMetadata(row.metadata),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		anchors
	};
}

export function listMediaAssets(projectPath: string): MediaAsset[] {
	const db = getDb(projectPath);
	return (
		db.prepare('SELECT * FROM media_assets ORDER BY created_at DESC').all() as MediaAssetRow[]
	).map(rowToAsset);
}

export function getMediaAsset(projectPath: string, assetId: string): MediaAsset | null {
	const db = getDb(projectPath);
	const row = db.prepare('SELECT * FROM media_assets WHERE id = ?').get(assetId) as
		MediaAssetRow | undefined;
	return row ? rowToAsset(row) : null;
}

export function getMediaAssetPath(projectPath: string, assetId: string): string {
	const asset = getMediaAsset(projectPath, assetId);
	if (!asset) throw new NotFoundError('Media asset not found');
	const base = realpathSync(resolve(projectPath));
	const candidate = resolve(base, asset.relativePath);
	if (!existsSync(candidate)) throw new NotFoundError('Media file is missing from the project');
	const path = realpathSync(candidate);
	const relativePath = relative(base, path);
	if (relativePath.startsWith('..') || isAbsolute(relativePath))
		throw new BadRequestError('Invalid media asset path');
	if (!statSync(path).isFile()) throw new NotFoundError('Media file is missing from the project');
	return path;
}

export async function importMediaAsset(
	projectPath: string,
	input: { sourceName: string; mimeType?: string; data: Uint8Array }
): Promise<MediaAsset> {
	const sourceName = input.sourceName.trim();
	if (!sourceName) throw new BadRequestError('Media file name is required');
	if (sourceName.length > 255 || /[\u0000-\u001f\u007f]/.test(sourceName))
		throw new BadRequestError('Media file name is invalid');
	if (input.data.byteLength === 0) throw new BadRequestError('Media file is empty');
	if (input.data.byteLength > MAX_MEDIA_BYTES)
		throw new BadRequestError('Media file is larger than 200 MB');
	const mimeType = safeMimeType(input.mimeType);
	const contentHash = createHash('sha256').update(input.data).digest('hex');
	const db = getDb(projectPath);
	const existing = db
		.prepare('SELECT * FROM media_assets WHERE content_hash = ?')
		.get(contentHash) as MediaAssetRow | undefined;
	if (existing) return rowToAsset(existing);
	const extension = safeExtension(sourceName, mimeType);
	const relativePath = join(MEDIA_DIR, `${contentHash}${extension}`);
	const absolutePath = join(projectPath, relativePath);
	mkdirSync(join(projectPath, MEDIA_DIR), { recursive: true });
	if (!existsSync(absolutePath)) writeFileSync(absolutePath, input.data, { flag: 'wx' });
	const now = new Date().toISOString();
	const id = randomUUID();
	db.prepare(
		`INSERT INTO media_assets
		 (id, content_hash, relative_path, source_name, mime_type, byte_size, duration_us, width, height, fps_num, fps_den, audio_channels, audio_sample_rate, metadata, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '{}', ?)`
	).run(id, contentHash, relativePath, sourceName, mimeType, input.data.byteLength, now);
	await probeMediaAsset(projectPath, id);
	return getMediaAsset(projectPath, id)!;
}

export async function probeMediaAsset(
	projectPath: string,
	assetId: string
): Promise<MediaAsset | null> {
	const path = getMediaAssetPath(projectPath, assetId);
	const db = getDb(projectPath);
	try {
		const { stdout } = await execFileAsync(
			'ffprobe',
			[
				'-v',
				'error',
				'-show_entries',
				'stream=index,codec_type,width,height,r_frame_rate,channels,sample_rate:format=duration',
				'-of',
				'json',
				path
			],
			{ maxBuffer: 1024 * 1024 }
		);
		const parsed = JSON.parse(stdout) as {
			streams?: ProbeStream[];
			format?: { duration?: string };
		};
		const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
		const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
		const [fpsNum, fpsDen] = parseRate(video?.r_frame_rate);
		const durationUs =
			parsed.format?.duration && Number.isFinite(Number(parsed.format.duration))
				? Math.round(Number(parsed.format.duration) * 1_000_000)
				: null;
		db.prepare(
			`UPDATE media_assets SET duration_us = ?, width = ?, height = ?, fps_num = ?, fps_den = ?, audio_channels = ?, audio_sample_rate = ? WHERE id = ?`
		).run(
			durationUs,
			video?.width ?? null,
			video?.height ?? null,
			fpsNum,
			fpsDen,
			audio?.channels ?? null,
			audio?.sample_rate ? Number(audio.sample_rate) : null,
			assetId
		);
	} catch {
		// ffprobe is optional. The imported bytes remain usable by browsers even when metadata probing is unavailable.
	}
	return getMediaAsset(projectPath, assetId);
}

export function listMediaBindings(projectPath: string, runId?: string): MediaBinding[] {
	const db = getDb(projectPath);
	const rows = (
		runId
			? db
					.prepare('SELECT * FROM media_run_bindings WHERE run_id = ? ORDER BY created_at')
					.all(runId)
			: db.prepare('SELECT * FROM media_run_bindings ORDER BY created_at DESC').all()
	) as BindingRow[];
	return rows.map((row) => {
		const anchors = db
			.prepare('SELECT * FROM media_sync_anchors WHERE binding_id = ? ORDER BY ordinal')
			.all(row.id) as AnchorRow[];
		return rowToBinding(row, anchors.map(rowToAnchor));
	});
}

export function getMediaBinding(projectPath: string, bindingId: string): MediaBinding | null {
	const db = getDb(projectPath);
	const row = db.prepare('SELECT * FROM media_run_bindings WHERE id = ?').get(bindingId) as
		BindingRow | undefined;
	if (!row) return null;
	const anchors = db
		.prepare('SELECT * FROM media_sync_anchors WHERE binding_id = ? ORDER BY ordinal')
		.all(bindingId) as AnchorRow[];
	return rowToBinding(row, anchors.map(rowToAnchor));
}

export function upsertMediaBinding(
	projectPath: string,
	input: {
		assetId: string;
		runId: string;
		offsetUs?: number;
		rate?: number;
		metadata?: Record<string, unknown>;
	}
): MediaBinding {
	const db = getDb(projectPath);
	if (!getMediaAsset(projectPath, input.assetId)) throw new NotFoundError('Media asset not found');
	if (!db.prepare('SELECT id FROM runs WHERE id = ?').get(input.runId))
		throw new NotFoundError('Run not found');
	const rate = input.rate ?? 1;
	if (!Number.isFinite(rate) || rate <= 0)
		throw new BadRequestError('Media rate must be greater than zero');
	const offsetUs = input.offsetUs ?? 0;
	if (!Number.isFinite(offsetUs)) throw new BadRequestError('Media offset must be finite');
	const now = new Date().toISOString();
	const id =
		(
			db
				.prepare('SELECT id FROM media_run_bindings WHERE asset_id = ? AND run_id = ?')
				.get(input.assetId, input.runId) as { id: string } | undefined
		)?.id ?? randomUUID();
	let metadataJson: string;
	try {
		metadataJson = JSON.stringify(input.metadata ?? {});
	} catch {
		throw new BadRequestError('Media metadata must be serializable');
	}
	if (metadataJson.length > 64 * 1024) throw new BadRequestError('Media metadata is too large');
	db.prepare(
		`INSERT INTO media_run_bindings (id, asset_id, run_id, offset_us, rate, metadata, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(asset_id, run_id) DO UPDATE SET offset_us = excluded.offset_us, rate = excluded.rate, metadata = excluded.metadata, updated_at = excluded.updated_at`
	).run(id, input.assetId, input.runId, Math.round(offsetUs), rate, metadataJson, now, now);
	return getMediaBinding(projectPath, id)!;
}

export function replaceMediaAnchors(
	projectPath: string,
	bindingId: string,
	anchors: Array<{ mediaTimeUs: number; runTimeUs: number; label?: string }>
): MediaBinding {
	const binding = getMediaBinding(projectPath, bindingId);
	if (!binding) throw new NotFoundError('Media binding not found');
	if (anchors.length > MAX_SYNC_ANCHORS)
		throw new BadRequestError(
			`A media binding cannot have more than ${MAX_SYNC_ANCHORS} sync anchors`
		);
	if (
		anchors.some(
			(anchor) => !Number.isFinite(anchor.mediaTimeUs) || !Number.isFinite(anchor.runTimeUs)
		)
	)
		throw new BadRequestError('Sync anchor times must be finite');
	const sorted = [...anchors].sort(
		(a, b) =>
			a.runTimeUs - b.runTimeUs ||
			a.mediaTimeUs - b.mediaTimeUs ||
			(a.label ?? '').localeCompare(b.label ?? '')
	);
	const db = getDb(projectPath);
	db.transaction(() => {
		db.prepare('DELETE FROM media_sync_anchors WHERE binding_id = ?').run(bindingId);
		const insert = db.prepare(
			'INSERT INTO media_sync_anchors (id, binding_id, ordinal, media_time_us, run_time_us, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
		);
		const now = new Date().toISOString();
		sorted.forEach((anchor, index) =>
			insert.run(
				randomUUID(),
				bindingId,
				index,
				Math.round(anchor.mediaTimeUs),
				Math.round(anchor.runTimeUs),
				anchor.label ?? '',
				now
			)
		);
	})();
	return getMediaBinding(projectPath, bindingId)!;
}

/** Convert a run clock (microseconds) to a media clock using one or more anchors. */
export function mapRunTimeToMediaTime(binding: MediaBinding, runTimeUs: number): number {
	if (!Number.isFinite(runTimeUs)) return Number.NaN;
	const anchors = binding.anchors;
	if (anchors.length === 0) return (runTimeUs - binding.offsetUs) / binding.rate;
	if (anchors.length === 1)
		return anchors[0].mediaTimeUs + (runTimeUs - anchors[0].runTimeUs) / binding.rate;
	let left = anchors[0];
	let right = anchors[1];
	if (runTimeUs <= anchors[0].runTimeUs) {
		left = anchors[0];
		right = anchors[1];
	} else if (runTimeUs >= anchors.at(-1)!.runTimeUs) {
		left = anchors.at(-2)!;
		right = anchors.at(-1)!;
	} else {
		for (let index = 1; index < anchors.length; index += 1) {
			if (runTimeUs <= anchors[index].runTimeUs) {
				left = anchors[index - 1];
				right = anchors[index];
				break;
			}
		}
	}
	const denominator = right.runTimeUs - left.runTimeUs;
	if (denominator === 0) return left.mediaTimeUs;
	return (
		left.mediaTimeUs +
		((runTimeUs - left.runTimeUs) * (right.mediaTimeUs - left.mediaTimeUs)) / denominator
	);
}

/** Build the single serializable track contract used by replay/render consumers. */
export function mediaTrackForBinding(asset: MediaAsset, binding: MediaBinding): MediaTrack {
	const metadata = binding.metadata;
	const startUs =
		finiteMetadataNumber(metadata, 'startUs') ?? finiteMetadataNumber(metadata, 'startTimeUs') ?? 0;
	return {
		assetId: asset.id,
		source: { kind: 'file', relativePath: asset.relativePath },
		mimeType: asset.mimeType,
		startUs,
		durationUs: asset.durationUs,
		syncOffsetUs: binding.offsetUs,
		rate: binding.rate,
		fpsNum: asset.fpsNum,
		fpsDen: asset.fpsDen,
		audio: { channels: asset.audioChannels, sampleRate: asset.audioSampleRate }
	};
}

/** Resolve the frame position for a canonical replay timestamp. */
export function lookupMediaFrame(
	track: MediaTrack,
	binding: MediaBinding,
	replayTimeUs: number
): MediaFrameLookup {
	const mediaTimeUs = mapRunTimeToMediaTime(binding, replayTimeUs);
	const elapsedUs = mediaTimeUs - track.startUs;
	const available =
		Number.isFinite(mediaTimeUs) &&
		elapsedUs >= 0 &&
		(track.durationUs === null || elapsedUs <= track.durationUs);
	const frameIndex =
		available && track.fpsNum && track.fpsDen
			? Math.max(0, Math.floor((elapsedUs * track.fpsNum) / (1_000_000 * track.fpsDen)))
			: null;
	return { track, replayTimeUs, mediaTimeUs, frameIndex, available };
}

function finiteMetadataNumber(metadata: Record<string, unknown>, key: string): number | null {
	const value = metadata[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeExtension(name: string, mimeType?: string): string {
	const extension = extname(name)
		.toLowerCase()
		.replace(/[^a-z0-9.]/g, '');
	if (extension.length >= 2 && extension.length <= 8) return extension;
	const fallback = mimeType
		?.split('/')[1]
		?.replace(/[^a-z0-9]/gi, '')
		.toLowerCase();
	return fallback ? `.${fallback}` : '.bin';
}

function safeMimeType(value?: string): string {
	if (
		!value ||
		value.length > 128 ||
		!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(value)
	) {
		return 'application/octet-stream';
	}
	return value;
}

function parseRate(value?: string): [number | null, number | null] {
	if (!value) return [null, null];
	const [num, den] = value.split('/').map(Number);
	return Number.isFinite(num) && Number.isFinite(den) && den > 0 ? [num, den] : [null, null];
}

interface MediaAssetRow {
	id: string;
	content_hash: string;
	relative_path: string;
	source_name: string;
	mime_type: string;
	byte_size: number;
	duration_us: number | null;
	width: number | null;
	height: number | null;
	fps_num: number | null;
	fps_den: number | null;
	audio_channels: number | null;
	audio_sample_rate: number | null;
	metadata: string;
	created_at: string;
}

interface BindingRow {
	id: string;
	asset_id: string;
	run_id: string;
	offset_us: number;
	rate: number;
	metadata: string;
	created_at: string;
	updated_at: string;
}

interface AnchorRow {
	id: string;
	binding_id: string;
	ordinal: number;
	media_time_us: number;
	run_time_us: number;
	label: string;
	created_at: string;
}

interface ProbeStream {
	codec_type?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
	channels?: number;
	sample_rate?: string;
}
