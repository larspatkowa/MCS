import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs, getDb } from '../db.js';
import { startRun, stopRun } from '../runs-db.js';
import {
	getMediaAssetPath,
	importMediaAsset,
	lookupMediaFrame,
	mapRunTimeToMediaTime,
	mediaTrackForBinding,
	replaceMediaAnchors,
	upsertMediaBinding
} from '../media-db.js';
import { validateRenderSpec } from '../render-jobs.js';

const roots: string[] = [];

function temporaryProject(name: string) {
	const root = mkdtempSync(join(tmpdir(), 'mcs-media-render-test-'));
	roots.push(root);
	process.env.MCS_CONFIG_DIR = join(root, 'config');
	process.env.MCS_PROJECTS_DIR = join(root, 'projects');
	clearConfigCache();
	const projectPath = join(root, 'projects', name.toLowerCase().replaceAll(' ', '-'));
	const manifest = createProject(projectPath, name);
	setDefaultProject(projectPath);
	return { projectPath, manifest };
}

afterEach(() => {
	closeAllProjectDbs();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('project media and render specifications', () => {
	it('content-addresses imported media and maps a run clock through sync anchors', async () => {
		const { projectPath } = temporaryProject('Media');
		const bytes = new TextEncoder().encode('not a real video, but durable project media');
		const first = await importMediaAsset(projectPath, {
			sourceName: 'capture.mp4',
			mimeType: 'video/mp4',
			data: bytes
		});
		const second = await importMediaAsset(projectPath, {
			sourceName: 'renamed.mp4',
			mimeType: 'video/mp4',
			data: bytes
		});
		expect(second.id).toBe(first.id);
		expect(getMediaAssetPath(projectPath, first.id)).toContain(
			`.mcs/media/${first.contentHash}.mp4`
		);

		const run = startRun(projectPath);
		stopRun(projectPath, run.id);
		const binding = upsertMediaBinding(projectPath, {
			assetId: first.id,
			runId: run.id,
			offsetUs: 100_000,
			rate: 2
		});
		expect(mapRunTimeToMediaTime(binding, 1_100_000)).toBe(500_000);
		const anchored = replaceMediaAnchors(projectPath, binding.id, [
			{ runTimeUs: 0, mediaTimeUs: 0, label: 'start' },
			{ runTimeUs: 2_000_000, mediaTimeUs: 1_000_000, label: 'clap' }
		]);
		expect(mapRunTimeToMediaTime(anchored, 1_000_000)).toBe(500_000);
	});

	it('keeps transparent export constraints explicit and validates deterministic bounds', () => {
		const spec = validateRenderSpec({
			projectId: 'project',
			objectId: 'object',
			start: 10,
			end: 11,
			fps: 30,
			width: 1280,
			height: 720,
			format: 'prores4444',
			transparent: true,
			baseUrl: 'http://127.0.0.1:5173'
		});
		expect(spec.transparent).toBe(true);
		expect(() => validateRenderSpec({ ...spec, format: 'h264' })).toThrow(
			'Transparent export requires prores4444'
		);
		expect(() => validateRenderSpec({ ...spec, end: 10 })).toThrow('greater than start');
	});

	it('rejects a media database path that resolves outside the project', async () => {
		const { projectPath } = temporaryProject('Safe paths');
		const asset = await importMediaAsset(projectPath, {
			sourceName: 'capture.mp4',
			mimeType: 'video/mp4',
			data: new TextEncoder().encode('media')
		});
		const outside = join(projectPath, '..', 'outside-media.bin');
		writeFileSync(outside, 'outside');
		const db = getDb(projectPath);
		const link = join(projectPath, '.mcs', 'media', 'escape.mp4');
		symlinkSync(outside, link);
		db.prepare('UPDATE media_assets SET relative_path = ? WHERE id = ?').run(
			'.mcs/media/escape.mp4',
			asset.id
		);
		expect(() => getMediaAssetPath(projectPath, asset.id)).toThrow('Invalid media asset path');
		rmSync(outside, { force: true });
	});

	it('resolves a bounded frame lookup from the canonical replay clock', async () => {
		const { projectPath } = temporaryProject('Frame lookup');
		const asset = await importMediaAsset(projectPath, {
			sourceName: 'capture.mp4',
			mimeType: 'video/mp4',
			data: new TextEncoder().encode('media')
		});
		const run = startRun(projectPath);
		stopRun(projectPath, run.id);
		const binding = upsertMediaBinding(projectPath, {
			assetId: asset.id,
			runId: run.id,
			offsetUs: 100_000,
			metadata: { startUs: 0 }
		});
		const track = mediaTrackForBinding(
			{ ...asset, fpsNum: 10, fpsDen: 1, durationUs: 1_000_000 },
			binding
		);
		const lookup = lookupMediaFrame(track, binding, 600_000);
		expect(lookup.available).toBe(true);
		expect(lookup.mediaTimeUs).toBe(500_000);
		expect(lookup.frameIndex).toBe(5);
		expect(lookupMediaFrame(track, binding, 1_500_000).available).toBe(false);
	});
});
