import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs, getDb } from '../db.js';
import { performIngestBatch } from '../ingest-core.js';
import * as runsDb from '../runs-db.js';
import * as streamsDb from '../streams-db.js';
import { exportRunPackage } from '../run-package.js';
import { importRun } from '../run-import.js';

const roots: string[] = [];

function createTemporaryProject(name: string) {
	const root = mkdtempSync(join(tmpdir(), 'mcs-runs-test-'));
	roots.push(root);
	const configDirectory = join(root, 'config');
	const projectsDirectory = join(root, 'projects');
	process.env.MCS_CONFIG_DIR = configDirectory;
	process.env.MCS_PROJECTS_DIR = projectsDirectory;
	clearConfigCache();
	const projectPath = join(projectsDirectory, name.toLowerCase().replaceAll(' ', '-'));
	const manifest = createProject(projectPath, name);
	setDefaultProject(projectPath);
	return { projectPath, manifest };
}

function count(projectPath: string, table: string): number {
	return (
		getDb(projectPath).prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }
	).count;
}

afterEach(() => {
	closeAllProjectDbs();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('run-scoped telemetry', () => {
	it('keeps ingest preview-only until recording, and honors pause/resume/finalize', () => {
		const { projectPath, manifest } = createTemporaryProject('Gate Test');
		performIngestBatch(manifest.id, [
			{ streamId: 'sensor:raw', timestamp: 1, values: { value: 1 } }
		]);
		expect(count(projectPath, 'samples')).toBe(0);
		expect(count(projectPath, 'telemetry_chunks')).toBe(0);
		expect(streamsDb.getStreamSamples(projectPath, 'sensor:raw')).toEqual([
			{ timestamp: 1, value: 1 }
		]);

		const run = runsDb.startRun(projectPath, { source: 'test' });
		expect(
			performIngestBatch(
				manifest.id,
				[
					{ streamId: 'sensor:raw', timestamp: 2, values: { value: 2 } },
					{ streamId: 'sensor:raw', timestamp: 3, values: { value: 3 } }
				],
				run.id
			)
		).toBe(run.id);
		expect(count(projectPath, 'telemetry_chunks')).toBe(1);
		expect(runsDb.getRun(projectPath, run.id).sampleCount).toBe(2);

		runsDb.pauseRun(projectPath, run.id);
		performIngestBatch(manifest.id, [
			{ streamId: 'sensor:raw', timestamp: 4, values: { value: 4 } }
		]);
		expect(count(projectPath, 'telemetry_chunks')).toBe(1);
		expect(runsDb.getRun(projectPath, run.id).status).toBe('paused');

		runsDb.resumeRun(projectPath, run.id);
		performIngestBatch(manifest.id, [
			{ streamId: 'sensor:raw', timestamp: 5, values: { value: 5 } }
		]);
		expect(count(projectPath, 'telemetry_chunks')).toBe(2);
		expect(runsDb.stopRun(projectPath, run.id).status).toBe('finalized');
		expect(runsDb.getRun(projectPath, run.id).sampleCount).toBe(3);
	});

	it('replays one explicit run with bounded peak-preserving data', () => {
		const { projectPath, manifest } = createTemporaryProject('Replay Test');
		const first = runsDb.startRun(projectPath);
		performIngestBatch(
			manifest.id,
			Array.from({ length: 100 }, (_, index) => ({
				streamId: 'sensor:raw',
				timestamp: index,
				values: { value: index === 50 ? 999 : index }
			}))
		);
		runsDb.stopRun(projectPath, first.id);

		const second = runsDb.startRun(projectPath);
		performIngestBatch(manifest.id, [
			{ streamId: 'sensor:raw', timestamp: 200, values: { value: 777 } }
		]);
		runsDb.stopRun(projectPath, second.id);

		const replay = runsDb.getRunReplay(projectPath, first.id, { limit: 8 });
		expect(replay.run.id).toBe(first.id);
		expect(replay.streams).toHaveLength(1);
		expect(replay.streams[0].data.length).toBeLessThanOrEqual(8);
		expect(replay.streams[0].data.some((sample) => sample.value === 999)).toBe(true);
		expect(replay.streams[0].data.some((sample) => sample.value === 777)).toBe(false);
	});

	it('pages full-fidelity replay events without downsampling or value loss', () => {
		const { projectPath, manifest } = createTemporaryProject('Event Pages');
		const run = runsDb.startRun(projectPath);
		performIngestBatch(
			manifest.id,
			[
				{ streamId: 'sensor:raw', timestamp: 1, values: { value: 10, rawCount: 100 } },
				{
					streamId: 'sensor:raw',
					timestamp: 1,
					values: { value: 11, rawCount: 101 },
					kind: 'derived'
				},
				{ streamId: 'other:raw', timestamp: 2, values: { value: 20 } }
			],
			run.id
		);
		runsDb.stopRun(projectPath, run.id);

		const first = runsDb.getRunEventPage(projectPath, run.id, { limit: 2 });
		expect(first.events).toHaveLength(2);
		expect(first.events[0].values).toHaveProperty('rawCount');
		expect(first.hasMore).toBe(true);
		expect(first.nextCursor).toBeTruthy();
		const second = runsDb.getRunEventPage(projectPath, run.id, {
			limit: 2,
			cursor: first.nextCursor!
		});
		expect(second.events).toHaveLength(1);
		expect(second.events[0].streamId).toBe('other:raw');
		expect(second.hasMore).toBe(false);
	});

	it('round-trips one versioned run package and rejects tampered samples', () => {
		const source = createTemporaryProject('Package Source');
		const run = runsDb.startRun(source.projectPath, { capture: 'test' });
		performIngestBatch(
			source.manifest.id,
			[
				{ streamId: 'sensor:raw', timestamp: 1, values: { value: 1 } },
				{ streamId: 'sensor:raw', timestamp: 2, values: { value: 2 }, kind: 'derived' }
			],
			run.id
		);
		runsDb.stopRun(source.projectPath, run.id);

		const packageText = [...exportRunPackage(source.projectPath, run.id)].join('');
		expect(packageText).toContain('mcs-run-package');
		expect(packageText).toContain('"scope":"sample-records"');

		const target = createTemporaryProject('Package Target');
		const imported = importRun(target.projectPath, packageText, { sourceName: 'run.ndjson' });
		expect(imported.samples).toBe(2);
		expect(imported.run.sampleCount).toBe(2);
		expect(streamsDb.listStreams(target.projectPath).map((stream) => stream.id)).toEqual([
			'sensor:raw'
		]);
		expect(() =>
			importRun(target.projectPath, packageText.replace('"value":2', '"value":3'), {
				sourceName: 'tampered.ndjson'
			})
		).toThrow('integrity check failed');
	});
});
