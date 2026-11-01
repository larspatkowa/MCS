import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildTelemetryEnvelope,
	evaluateChannel
} from '../../../../examples/flight-system/telemetry-model.mjs';

const packageRoot = resolve(process.cwd());
const cliPath = join(packageRoot, 'bin', 'mcs.js');
const temporaryDirectories: string[] = [];

function temporaryPath(name: string): string {
	const directory = mkdtempSync(join(tmpdir(), `mcs-${name}-`));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe('flight-system template', () => {
	it('rejects an unknown template before creating its destination', () => {
		const parent = temporaryPath('unknown-template');
		const destination = join(parent, 'should-not-exist');
		const result = spawnSync(process.execPath, [
			cliPath,
			'create',
			destination,
			'--template',
			'unknown'
		]);

		expect(result.status).toBe(1);
		expect(String(result.stderr)).toContain('unknown template "unknown"');
		expect(existsSync(destination)).toBe(false);
	});

	it('leaves the default create command blank', () => {
		const parent = temporaryPath('blank-template');
		const destination = join(parent, 'blank');
		execFileSync(process.execPath, [cliPath, 'create', destination], { stdio: 'pipe' });
		const projectPackage = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'));

		expect(projectPackage.scripts['demo:telemetry']).toBeUndefined();
		expect(existsSync(join(destination, 'examples'))).toBe(false);
		expect(spawnSync(process.execPath, [cliPath, 'doctor', destination]).status).toBe(0);
	});

	it('seeds an openable overview, source metadata, and recent plotted history', () => {
		const parent = temporaryPath('flight-template');
		const destination = join(parent, 'flight-test');
		execFileSync(
			process.execPath,
			[cliPath, 'create', destination, '--template', 'flight-system'],
			{
				stdio: 'pipe'
			}
		);
		const manifest = JSON.parse(readFileSync(join(destination, 'project.json'), 'utf8'));
		const projectPackage = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'));
		const database = new Database(join(destination, 'mcs.db'), { readonly: true });
		try {
			const types = database
				.prepare('SELECT type,COUNT(*) AS count FROM objects GROUP BY type')
				.all() as Array<{ type: string; count: number }>;
			const history = database
				.prepare(
					'SELECT COUNT(*) AS count,MIN(event_ts) AS first,MAX(event_ts) AS last FROM telemetry_history'
				)
				.get() as { count: number; first: number; last: number };
			const streams = database.prepare('SELECT COUNT(*) AS count FROM streams').get() as {
				count: number;
			};
			const source = database
				.prepare('SELECT id,expected_period_ms FROM telemetry_sources WHERE id=?')
				.get('flight-system-demo') as { id: string; expected_period_ms: number };

			expect(types.map((row) => row.type)).toEqual(
				expect.arrayContaining([
					'flex-layout',
					'line-plot',
					'gauge',
					'telemetry-table',
					'markdown-note'
				])
			);
			expect(history.count).toBe(288);
			expect(history.last - history.first).toBeGreaterThan(40);
			expect(streams.count).toBe(6);
			expect(source.expected_period_ms).toBe(1000);
		} finally {
			database.close();
		}

		expect(manifest.settings.defaultObjectId).toBe('flight-overview');
		expect(projectPackage.scripts['demo:telemetry']).toBe(
			'node examples/flight-system/telemetry-simulator.mjs'
		);
		expect(existsSync(join(destination, 'examples/flight-system/seed.json'))).toBe(true);
		expect(readFileSync(join(destination, 'README.md'), 'utf8')).toContain(
			'All demo values are simulated'
		);
		expect(readFileSync(join(destination, 'README.md'), 'utf8')).toContain('In Terminal 1');
		expect(spawnSync(process.execPath, [cliPath, 'doctor', destination]).status).toBe(0);
	});

	it('generates stable telemetry values and envelope keys for a fixed timestamp', () => {
		const seed = JSON.parse(
			readFileSync(join(packageRoot, 'project-format/templates/flight-system/seed.json'), 'utf8')
		);
		const channel = seed.channels[0];
		const first = evaluateChannel(channel, 1_800_000_000);
		const second = evaluateChannel(channel, 1_800_000_000);
		const envelope = buildTelemetryEnvelope({
			projectId: 'project-id',
			source: seed.source,
			channels: [channel],
			timestampSeconds: 1_800_000_000.25,
			sequence: 1_800_000_000
		});

		expect(first).toBe(second);
		expect(envelope.version).toBe(1);
		expect(envelope.samples[0].sequence).toBe(1_800_000_000);
		expect(envelope.samples[0].idempotencyKey).toBe(
			'flight-system-demo-flight.altitude-1800000000'
		);
		expect(envelope.samples[0].sourceTimestamp.value).toBe(1_800_000_000.25);
		expect(envelope.samples[0].values.value).toBe(evaluateChannel(channel, 1_800_000_000.25));
	});
});
