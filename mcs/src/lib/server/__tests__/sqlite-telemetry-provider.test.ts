import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs, closeProjectDb } from '../db.js';
import { normalizeSourceTime } from '../clock-normalization.js';
import { SQLiteTelemetryProvider } from '../sqlite-telemetry-provider.js';
import * as streamsDb from '../streams-db.js';
import * as sourcesDb from '../sources-db.js';

const roots: string[] = [];

function setupProject(name: string) {
	const root = mkdtempSync(join(tmpdir(), 'mcs-telemetry-provider-'));
	roots.push(root);
	const projectPath = join(root, 'project');
	process.env.MCS_CONFIG_DIR = join(root, 'config');
	process.env.MCS_PROJECTS_DIR = join(root, 'projects');
	clearConfigCache();
	const manifest = createProject(projectPath, name);
	setDefaultProject(projectPath);
	return { projectPath, projectId: manifest.id };
}

afterEach(() => {
	closeAllProjectDbs();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('SQLite telemetry provider', () => {
	it('aligns UTC and GPS sources, preserves exact timestamp strings, and resumes bounded history pages', async () => {
		const { projectPath, projectId } = setupProject('Historian');
		const targetUtc = 1_700_000_000.1234567;
		const rawNanoseconds = '1700000000123456789';
		const utc = normalizeSourceTime(rawNanoseconds, 'nanoseconds', {
			timeSystem: 'UTC',
			offsetSeconds: 2
		});
		const gpsValue = targetUtc - 315_964_800 + 18;
		const gps = normalizeSourceTime(gpsValue, 'seconds', {
			timeSystem: 'GPS',
			offsetSeconds: 2
		});
		expect(gps.eventTimeUtc).toBeCloseTo(utc.eventTimeUtc, 6);

		const accepted = streamsDb.ingestSamplesDetailed(projectPath, [
			{
				streamId: 'vehicle:altitude',
				timestamp: utc.eventTimeUtc,
				values: { value: 10 },
				telemetry: {
					sourceId: 'utc-source',
					sourceTimestamp: rawNanoseconds,
					sourceUnit: 'nanoseconds',
					sourceTimeSystem: 'UTC',
					idempotencyKey: 'utc-1',
					quality: { clock: utc.quality.clockQuality },
					provenance: { normalization: utc.quality.provenance }
				}
			},
			{
				streamId: 'vehicle:altitude',
				timestamp: gps.eventTimeUtc,
				values: { value: 10 },
				telemetry: {
					sourceId: 'gps-source',
					sourceTimestamp: gpsValue,
					sourceUnit: 'seconds',
					sourceTimeSystem: 'GPS',
					sequence: 10,
					idempotencyKey: 'gps-10'
				}
			},
			{
				streamId: 'vehicle:altitude',
				timestamp: gps.eventTimeUtc + 1,
				values: { value: 5 },
				telemetry: {
					sourceId: 'gps-source',
					sourceTimestamp: gpsValue + 1,
					sourceUnit: 'seconds',
					sourceTimeSystem: 'GPS',
					sequence: 12,
					idempotencyKey: 'gps-12'
				}
			},
			{
				streamId: 'vehicle:altitude',
				timestamp: gps.eventTimeUtc + 0.5,
				values: { value: -20 },
				telemetry: {
					sourceId: 'gps-source',
					sourceTimestamp: gpsValue + 0.5,
					sourceUnit: 'seconds',
					sourceTimeSystem: 'GPS',
					sequence: 11,
					idempotencyKey: 'gps-11'
				}
			}
		]);
		expect(accepted.inserted).toHaveLength(4);
		expect(accepted.acknowledgedIds).toEqual(['utc-1', 'gps-10', 'gps-12', 'gps-11']);

		const retry = streamsDb.ingestSamplesDetailed(projectPath, [
			{
				streamId: 'vehicle:altitude',
				timestamp: gps.eventTimeUtc + 0.5,
				values: { value: -20 },
				telemetry: {
					sourceId: 'gps-source',
					sourceTimestamp: gpsValue + 0.5,
					sourceUnit: 'seconds',
					sourceTimeSystem: 'GPS',
					sequence: 11,
					idempotencyKey: 'gps-11'
				}
			}
		]);
		expect(retry.inserted).toHaveLength(0);
		expect(retry.acknowledgedIds).toEqual(['gps-11']);

		const provider = new SQLiteTelemetryProvider(projectId, projectPath);
		const firstPage = await provider.query({
			sourceId: 'gps-source',
			streamId: 'vehicle:altitude',
			from: utc.eventTimeUtc - 1,
			to: utc.eventTimeUtc + 2,
			resolution: 'raw',
			maxSamples: 2
		});
		expect(firstPage.samples.map((sample) => sample.sequence)).toEqual([10, 11]);
		expect(firstPage.nextPageCursor).toBeTruthy();
		const secondPage = await provider.query({
			sourceId: 'gps-source',
			streamId: 'vehicle:altitude',
			from: utc.eventTimeUtc - 1,
			to: utc.eventTimeUtc + 2,
			resolution: 'raw',
			maxSamples: 2,
			pageCursor: firstPage.nextPageCursor
		});
		expect(secondPage.samples.map((sample) => sample.sequence)).toEqual([12]);

		const reduced = await provider.query({
			sourceId: 'gps-source',
			streamId: 'vehicle:altitude',
			from: utc.eventTimeUtc - 1,
			to: utc.eventTimeUtc + 2,
			resolution: 'minmax',
			maxSamples: 2,
			field: 'value'
		});
		expect(reduced.samples.map((sample) => sample.values.value).sort()).toEqual([-20, 10]);

		const utcPage = await provider.query({
			sourceId: 'utc-source',
			streamId: 'vehicle:altitude',
			from: utc.eventTimeUtc - 1,
			to: utc.eventTimeUtc + 2,
			resolution: 'raw',
			maxSamples: 4
		});
		expect(utcPage.samples[0].sourceTimestamp.value).toBe(rawNanoseconds);
		expect(utcPage.samples[0].sourceTimestamp.unit).toBe('nanoseconds');
		expect(utcPage.samples[0].eventTimeUtc).toBeCloseTo(gps.eventTimeUtc, 6);

		const metadata = await provider.getMetadata();
		expect(metadata.map((source) => source.sourceId)).toEqual(['gps-source', 'utc-source']);
		expect(metadata[0].streams[0].fields?.map((field) => field.key)).toContain('value');

		closeProjectDb(projectPath);
		const afterRestart = await new SQLiteTelemetryProvider(projectId, projectPath).query({
			sourceId: 'gps-source',
			streamId: 'vehicle:altitude',
			from: utc.eventTimeUtc - 1,
			to: utc.eventTimeUtc + 2,
			resolution: 'raw',
			maxSamples: 4
		});
		expect(afterRestart.samples).toHaveLength(3);
	});

	it('rejects cursors from a different bounded query', async () => {
		const { projectPath, projectId } = setupProject('Cursor Validation');
		const provider = new SQLiteTelemetryProvider(projectId, projectPath);
		const cursor = Buffer.from(
			JSON.stringify({
				version: 1,
				sourceId: 'a',
				streamId: 's',
				from: 1,
				to: 2,
				resolution: 'raw',
				lastTime: 1,
				lastId: 1
			})
		).toString('base64url');
		await expect(
			provider.query({
				sourceId: 'a',
				streamId: 's',
				from: 1,
				to: 3,
				resolution: 'raw',
				maxSamples: 1,
				pageCursor: cursor
			})
		).rejects.toThrow(/does not match/);
	});

	it('records sequence gaps and resolves them when late samples arrive', () => {
		const { projectPath } = setupProject('Sequence gaps');
		const batch = (sequence: number) =>
			streamsDb.ingestSamplesDetailed(projectPath, [
				{
					streamId: 'vehicle:health',
					timestamp: sequence,
					values: { value: sequence },
					telemetry: {
						sourceId: 'bridge-a',
						sourceTimestamp: sequence,
						sourceUnit: 'seconds',
						sourceTimeSystem: 'unix-utc',
						sequence,
						idempotencyKey: `health-${sequence}`
					}
				}
			]);

		batch(10);
		batch(12);
		expect(sourcesDb.getSource(projectPath, 'bridge-a')).toMatchObject({
			missingSequenceCount: 1,
			openGapCount: 1
		});
		batch(11);
		expect(sourcesDb.getSource(projectPath, 'bridge-a')).toMatchObject({
			missingSequenceCount: 0,
			openGapCount: 0
		});
	});
});
