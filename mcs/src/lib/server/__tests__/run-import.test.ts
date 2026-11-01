import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs } from '../db.js';
import { getRunEventPage, getRunReplay } from '../runs-db.js';
import { importRun } from '../run-import.js';

const roots: string[] = [];

function temporaryProject(name: string) {
	const root = mkdtempSync(join(tmpdir(), 'mcs-run-import-test-'));
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

describe('generic run import', () => {
	it('imports long-form CSV with millisecond timestamps into a finalized run', () => {
		const { projectPath } = temporaryProject('CSV Import');
		const result = importRun(
			projectPath,
			'timestamp,streamId,value,rawCount\n1000,thrust,12,100\n2000,thrust,18,200\n',
			{
				format: 'csv',
				timestampUnit: 'milliseconds',
				sourceName: 'thrust.csv'
			}
		);
		expect(result.run.status).toBe('finalized');
		expect(result.samples).toBe(2);
		expect(result.streams).toEqual(['thrust']);
		expect(result.firstTimestamp).toBe(1);
		expect(
			getRunReplay(projectPath, result.run.id, { limit: 10 }).streams[0].data.map(
				(sample) => sample.value
			)
		).toEqual([12, 18]);
	});

	it('imports NDJSON envelopes and preserves raw/derived event kinds', () => {
		const { projectPath } = temporaryProject('NDJSON Import');
		const result = importRun(
			projectPath,
			JSON.stringify({
				samples: [
					{ ts: 1_000_000, streamId: 'thrust', values: { value: 5 }, kind: 'raw' },
					{ ts: 1_500_000, streamId: 'thrust', values: { value: 6 }, kind: 'derived' }
				]
			}),
			{ format: 'json', timestampUnit: 'microseconds', sourceName: 'capture.json' }
		);
		const events = getRunEventPage(projectPath, result.run.id, { limit: 10 }).events;
		expect(events.map((event) => event.kind)).toEqual(['raw', 'derived']);
		expect(events.map((event) => event.timestamp)).toEqual([1, 1.5]);
	});
});
