import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { getDb } from './db.js';
import { BadRequestError, NotFoundError } from './errors.js';
import { getRun } from './runs-db.js';

const execFileAsync = promisify(execFile);

export type RenderFormat = 'h264' | 'prores4444';

export interface RenderSpec {
	projectId: string;
	objectId: string;
	runId?: string;
	start: number;
	end: number;
	fps: number;
	width: number;
	height: number;
	format: RenderFormat;
	background: string;
	transparent: boolean;
	baseUrl: string;
}

export interface RenderJob {
	id: string;
	runId: string | null;
	objectId: string | null;
	status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
	spec: RenderSpec;
	manifest: Record<string, unknown>;
	outputPath: string | null;
	error: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface RenderManifest {
	frameCount: number;
	fps: number;
	start: number;
	end: number;
	width: number;
	height: number;
	format: RenderFormat;
	transparent: boolean;
	framePattern: string;
	encoding: { status: 'encoded' | 'unavailable' | 'failed'; format: RenderFormat; error?: string };
}

function parseJson(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function rowToJob(row: RenderJobRow): RenderJob {
	return {
		id: row.id,
		runId: row.run_id,
		objectId: row.object_id,
		status: row.status,
		spec: parseJson(row.spec_json) as unknown as RenderSpec,
		manifest: parseJson(row.manifest_json),
		outputPath: row.output_path,
		error: row.error,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export function validateRenderSpec(input: Partial<RenderSpec>): RenderSpec {
	const start = number(input.start, 'start');
	const end = number(input.end, 'end');
	if (end <= start) throw new BadRequestError('Render end must be greater than start');
	const fps = integer(input.fps ?? 60, 'fps', 1, 240);
	const width = integer(input.width ?? 1920, 'width', 64, 8192);
	const height = integer(input.height ?? 1080, 'height', 64, 8192);
	const format =
		input.format === 'prores4444'
			? 'prores4444'
			: input.format === 'h264' || input.format === undefined
				? 'h264'
				: null;
	if (!format) throw new BadRequestError('format must be h264 or prores4444');
	const transparent = input.transparent === true;
	if (transparent && format !== 'prores4444')
		throw new BadRequestError('Transparent export requires prores4444');
	if (typeof input.projectId !== 'string' || !input.projectId)
		throw new BadRequestError('projectId is required');
	if (typeof input.objectId !== 'string' || !input.objectId)
		throw new BadRequestError('objectId is required');
	if (typeof input.baseUrl !== 'string' || !/^https?:\/\//.test(input.baseUrl))
		throw new BadRequestError('baseUrl must be an http(s) URL');
	const frameCount = Math.floor((end - start) * fps) + 1;
	if (frameCount > 1_000_000)
		throw new BadRequestError('Render range is too large; reduce duration or frame rate');
	return {
		projectId: input.projectId,
		objectId: input.objectId,
		runId: input.runId || undefined,
		start,
		end,
		fps,
		width,
		height,
		format,
		background: safeBackground(input.background),
		transparent,
		baseUrl: input.baseUrl.replace(/\/$/, '')
	};
}

export function createRenderJob(projectPath: string, spec: RenderSpec): RenderJob {
	if (spec.runId) getRun(projectPath, spec.runId);
	const db = getDb(projectPath);
	if (!db.prepare('SELECT id FROM objects WHERE id = ?').get(spec.objectId))
		throw new NotFoundError('Render object not found');
	const id = randomUUID();
	const now = new Date().toISOString();
	db.prepare(
		`INSERT INTO render_jobs (id, run_id, object_id, status, spec_json, manifest_json, output_path, error, created_at, updated_at)
		 VALUES (?, ?, ?, 'queued', ?, '{}', NULL, NULL, ?, ?)`
	).run(id, spec.runId ?? null, spec.objectId, JSON.stringify(spec), now, now);
	return getRenderJob(projectPath, id)!;
}

export function listRenderJobs(projectPath: string): RenderJob[] {
	const db = getDb(projectPath);
	return (
		db.prepare('SELECT * FROM render_jobs ORDER BY updated_at DESC').all() as RenderJobRow[]
	).map(rowToJob);
}

export function getRenderJob(projectPath: string, jobId: string): RenderJob | null {
	const db = getDb(projectPath);
	const row = db.prepare('SELECT * FROM render_jobs WHERE id = ?').get(jobId) as
		RenderJobRow | undefined;
	return row ? rowToJob(row) : null;
}

export function getRenderOutputPath(projectPath: string, jobId: string): string {
	const job = getRenderJob(projectPath, jobId);
	if (!job || job.status !== 'completed' || !job.outputPath)
		throw new NotFoundError('Render output not found');
	const path = safeRenderPath(projectPath, job.outputPath);
	if (!existsSync(path) || !statSync(path).isFile())
		throw new NotFoundError('Render output is missing');
	return path;
}

export function getRenderFramePath(
	projectPath: string,
	jobId: string,
	frameNumber: number
): string {
	const job = getRenderJob(projectPath, jobId);
	if (!job || job.status !== 'completed')
		throw new NotFoundError('Render frame sequence not found');
	const frameCount = typeof job.manifest.frameCount === 'number' ? job.manifest.frameCount : 0;
	if (!Number.isInteger(frameNumber) || frameNumber < 1 || frameNumber > frameCount)
		throw new NotFoundError('Render frame not found');
	const path = safeRenderPath(
		projectPath,
		join('.mcs', 'renders', job.id, 'frames', `frame-${String(frameNumber).padStart(6, '0')}.png`)
	);
	if (!existsSync(path) || !statSync(path).isFile())
		throw new NotFoundError('Render frame is missing');
	return path;
}

export async function runRenderJob(projectPath: string, jobId: string): Promise<RenderJob | null> {
	const job = getRenderJob(projectPath, jobId);
	if (!job) throw new NotFoundError('Render job not found');
	if (job.status !== 'queued') return job;
	setStatus(projectPath, jobId, 'running', null, {});
	const frameDir = safeRenderPath(projectPath, join('.mcs', 'renders', jobId, 'frames'));
	const outputRelative = join(
		'.mcs',
		'renders',
		jobId,
		`${job.spec.format === 'prores4444' ? 'render-prores.mov' : 'render-h264.mp4'}`
	);
	const outputPath = safeRenderPath(projectPath, outputRelative);
	let frameCount = 0;
	try {
		mkdirSync(frameDir, { recursive: true });
		const { chromium } = await import('playwright');
		const browser = await chromium.launch({ headless: true });
		try {
			const page = await browser.newPage({
				viewport: { width: job.spec.width, height: job.spec.height },
				deviceScaleFactor: 1
			});
			const query = new URLSearchParams({
				objectId: job.spec.objectId,
				start: String(job.spec.start),
				end: String(job.spec.end),
				fps: String(job.spec.fps),
				background: job.spec.background
			});
			if (job.spec.runId) query.set('runId', job.spec.runId);
			if (job.spec.transparent) query.set('transparent', '1');
			await page.goto(
				`${job.spec.baseUrl}/render/${encodeURIComponent(job.spec.projectId)}?${query.toString()}`,
				{ waitUntil: 'networkidle' }
			);
			await page.waitForFunction(
				() => (window as Window & { __mcsRenderReady?: boolean }).__mcsRenderReady === true,
				null,
				{ timeout: 30_000 }
			);
			frameCount = Math.max(1, Math.floor((job.spec.end - job.spec.start) * job.spec.fps) + 1);
			for (let index = 0; index < frameCount; index += 1) {
				const timestamp = job.spec.start + index / job.spec.fps;
				await page.evaluate(async (time) => {
					await (
						window as Window & { __mcsRenderSeek?: (value: number) => void | Promise<void> }
					).__mcsRenderSeek?.(time);
					await new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					);
				}, timestamp);
				await page.screenshot({
					path: join(frameDir, `frame-${String(index + 1).padStart(6, '0')}.png`),
					omitBackground: job.spec.transparent
				});
			}
		} finally {
			await browser.close();
		}
		const ffmpegArgs =
			job.spec.format === 'prores4444'
				? [
						'-y',
						'-framerate',
						String(job.spec.fps),
						'-i',
						join(frameDir, 'frame-%06d.png'),
						'-c:v',
						'prores_ks',
						'-profile:v',
						'4',
						'-pix_fmt',
						'yuva444p10le',
						outputPath
					]
				: [
						'-y',
						'-framerate',
						String(job.spec.fps),
						'-i',
						join(frameDir, 'frame-%06d.png'),
						'-c:v',
						'libx264',
						'-pix_fmt',
						'yuv420p',
						'-movflags',
						'+faststart',
						outputPath
					];
		let outputPathForJob: string | null = outputRelative;
		let encoding: RenderManifest['encoding'] = { status: 'encoded', format: job.spec.format };
		try {
			await execFileAsync('ffmpeg', ffmpegArgs, {
				maxBuffer: 4 * 1024 * 1024,
				timeout: 120_000,
				killSignal: 'SIGTERM'
			});
		} catch (error) {
			outputPathForJob = null;
			if (existsSync(outputPath)) unlinkSync(outputPath);
			encoding = {
				status: isMissingEncoder(error) ? 'unavailable' : 'failed',
				format: job.spec.format,
				error: encoderError(error)
			};
		}
		const manifest: RenderManifest = {
			frameCount,
			fps: job.spec.fps,
			start: job.spec.start,
			end: job.spec.end,
			width: job.spec.width,
			height: job.spec.height,
			format: job.spec.format,
			transparent: job.spec.transparent,
			framePattern: 'frame-%06d.png',
			encoding
		};
		setStatus(
			projectPath,
			jobId,
			'completed',
			outputPathForJob,
			manifest as unknown as Record<string, unknown>,
			encoding.status === 'encoded' ? null : (encoding.error ?? 'Video encoding failed')
		);
	} catch (error) {
		const message = renderError(error);
		setStatus(projectPath, jobId, 'failed', null, { frameCount }, message);
		rmSync(frameDir, { recursive: true, force: true });
		return getRenderJob(projectPath, jobId);
	}
	return getRenderJob(projectPath, jobId);
}

function setStatus(
	projectPath: string,
	jobId: string,
	status: RenderJob['status'],
	outputPath: string | null,
	manifest: Record<string, unknown>,
	error: string | null = null
): void {
	const db = getDb(projectPath);
	db.prepare(
		'UPDATE render_jobs SET status = ?, output_path = ?, manifest_json = ?, error = ?, updated_at = ? WHERE id = ?'
	).run(status, outputPath, JSON.stringify(manifest), error, new Date().toISOString(), jobId);
}

function safeRenderPath(projectPath: string, relativePath: string): string {
	const root = resolve(projectPath, '.mcs', 'renders');
	const path = resolve(projectPath, relativePath);
	const within = relative(root, path);
	if (!within || within.startsWith('..') || isAbsolute(within))
		throw new BadRequestError('Invalid render output path');
	return path;
}

function isMissingEncoder(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

function encoderError(error: unknown): string {
	if (isMissingEncoder(error)) return 'Video encoder unavailable: ffmpeg is not installed';
	if (typeof error === 'object' && error !== null && 'code' in error)
		return `Video encoder failed (exit code ${String((error as { code?: unknown }).code)}).`;
	return 'Video encoder failed.';
}

function renderError(error: unknown): string {
	if (error instanceof Error && error.name === 'TimeoutError')
		return 'Render timed out while preparing a frame.';
	return 'Render failed while preparing the frame sequence.';
}

function number(value: unknown, label: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value))
		throw new BadRequestError(`${label} must be finite`);
	return value;
}

function integer(value: unknown, label: string, min: number, max: number): number {
	const parsed = number(value, label);
	if (!Number.isInteger(parsed) || parsed < min || parsed > max)
		throw new BadRequestError(`${label} must be an integer from ${min} to ${max}`);
	return parsed;
}

function safeBackground(value: unknown): string {
	const background = typeof value === 'string' ? value.trim() : '';
	if (!background) return '#202020';
	if (!/^#[0-9a-f]{3,8}$/i.test(background))
		throw new BadRequestError('background must be a hexadecimal color');
	return background;
}

interface RenderJobRow {
	id: string;
	run_id: string | null;
	object_id: string | null;
	status: RenderJob['status'];
	spec_json: string;
	manifest_json: string;
	output_path: string | null;
	error: string | null;
	created_at: string;
	updated_at: string;
}
