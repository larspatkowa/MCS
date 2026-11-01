import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs } from '../db.js';
import * as streamsDb from '../streams-db.js';

const roots: string[] = [];

function projectWithSeries(values: number[]) {
	const root = mkdtempSync(join(tmpdir(), 'mcs-samples-test-'));
	roots.push(root);
	process.env.MCS_CONFIG_DIR = join(root, 'config');
	process.env.MCS_PROJECTS_DIR = join(root, 'projects');
	clearConfigCache();
	const projectPath = join(root, 'projects', 'samples');
	createProject(projectPath, 'Samples');
	setDefaultProject(projectPath);
	for (let start = 0; start < values.length; start += 5_000) {
		streamsDb.ingestSamples(
			projectPath,
			values.slice(start, start + 5_000).map((value, offset) => ({
				streamId: 'flight:alt',
				timestamp: 1_000 + start + offset,
				values: { value }
			}))
		);
	}
	return projectPath;
}

afterEach(() => {
	closeAllProjectDbs();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('stream sample windows', () => {
	it('covers the whole window and keeps the peak when a window exceeds the limit', () => {
		const values = Array.from({ length: 20_000 }, (_, i) => (i === 13_337 ? 9_000 : i % 100));
		const projectPath = projectWithSeries(values);
		const samples = streamsDb.getStreamSamples(projectPath, 'flight:alt', 1_000, 21_000, 1_000);
		expect(samples.length).toBeLessThanOrEqual(1_000);
		expect(samples[0].timestamp).toBeLessThan(1_100);
		expect(samples.at(-1)!.timestamp).toBeGreaterThan(20_900);
		expect(Math.max(...samples.map((sample) => sample.value))).toBe(9_000);
		const times = samples.map((sample) => sample.timestamp);
		expect(times).toEqual([...times].sort((a, b) => a - b));
	});

	it('returns the newest sample at or before a playhead', () => {
		const projectPath = projectWithSeries([1, 2, 3, 4, 5]);
		expect(streamsDb.getStreamSamples(projectPath, 'flight:alt', undefined, 1_002.5, 1)).toEqual([
			expect.objectContaining({ timestamp: 1_002, value: 3 })
		]);
	});

	it('keeps small windows complete and in order', () => {
		const projectPath = projectWithSeries([5, 6, 7]);
		const samples = streamsDb.getStreamSamples(projectPath, 'flight:alt', 1_000, 1_002, 100);
		expect(samples.map((sample) => sample.value)).toEqual([5, 6, 7]);
	});
});
