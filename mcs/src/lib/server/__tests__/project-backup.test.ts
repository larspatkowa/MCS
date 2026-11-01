import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs, getDb } from '../db.js';
import { backupProjectDirectory, restoreProjectBackup } from '../../../../project-format/backup.js';
import * as streamsDb from '../streams-db.js';

const roots: string[] = [];

afterEach(() => {
	closeAllProjectDbs();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('project backup and restore', () => {
	it('backs up continuous history and media, then restores into a new project directory', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-backup-test-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		process.env.MCS_PROJECTS_DIR = join(root, 'projects');
		clearConfigCache();
		const source = join(root, 'source');
		const project = createProject(source, 'Backup Test');
		setDefaultProject(source);
		streamsDb.ingestSamples(source, [
			{ streamId: 'sensor:raw', timestamp: 123, values: { value: 42 } }
		]);
		mkdirSync(join(source, '.mcs', 'media'), { recursive: true });
		writeFileSync(join(source, '.mcs', 'media', 'capture.bin'), Buffer.from([1, 2, 3, 4]));
		mkdirSync(join(source, '.mcs', 'runtime'), { recursive: true });
		writeFileSync(join(source, '.mcs', 'runtime', 'config.json'), '{"private":"runtime settings"}');

		const backupPath = join(root, 'backups', 'snapshot');
		const result = await backupProjectDirectory(source, backupPath);
		expect(result.projectId).toBe(project.id);
		expect(readFileSync(join(backupPath, '.mcs', 'media', 'capture.bin'))).toEqual(
			Buffer.from([1, 2, 3, 4])
		);
		expect(() => readFileSync(join(backupPath, '.mcs', 'runtime', 'config.json'))).toThrow();

		const restoredPath = join(root, 'restored');
		const restored = await restoreProjectBackup(backupPath, restoredPath);
		expect(restored.projectId).toBe(project.id);
		expect(readFileSync(join(restoredPath, '.mcs', 'media', 'capture.bin'))).toEqual(
			Buffer.from([1, 2, 3, 4])
		);
		expect(getDb(restoredPath).prepare('SELECT payload FROM telemetry_history').get()).toEqual({
			payload: '{"value":42}'
		});
	});

	it('rejects a modified backup before creating a restore target', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-backup-tamper-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		process.env.MCS_PROJECTS_DIR = join(root, 'projects');
		clearConfigCache();
		const source = join(root, 'source');
		createProject(source, 'Tamper Test');
		const backupPath = join(root, 'backup');
		await backupProjectDirectory(source, backupPath);
		const manifest = JSON.parse(readFileSync(join(backupPath, 'backup.json'), 'utf8')) as {
			entries: { path: string }[];
		};
		const asset = manifest.entries.find((entry) => entry.path === 'project.json')!;
		writeFileSync(join(backupPath, asset.path), 'tampered');
		const target = join(root, 'restored');
		await expect(restoreProjectBackup(backupPath, target)).rejects.toThrow(
			/integrity verification/
		);
		expect(() => readFileSync(target)).toThrow();
	});
});
