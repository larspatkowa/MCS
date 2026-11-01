import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	initializeProjectDirectory,
	inspectProjectDirectory,
	upgradeProjectDirectory
} from '../../../../project-format/project.js';
import { readManifest, writeManifest } from '../project.js';

const temporaryRoots: string[] = [];

function makeProjectPath(name: string): string {
	const root = mkdtempSync(join(tmpdir(), 'mcs-project-format-test-'));
	temporaryRoots.push(root);
	return join(root, name);
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('portable MCS project format', () => {
	it('creates a valid blank project database', () => {
		const projectPath = makeProjectPath('project');
		const manifest = initializeProjectDirectory(projectPath, {
			name: 'Test Project',
			mcsVersion: 'test'
		});

		expect(manifest.name).toBe('Test Project');
		expect(manifest.settings).toBeUndefined();
		expect(existsSync(join(projectPath, 'mcs.db'))).toBe(true);

		const metadata = JSON.parse(readFileSync(join(projectPath, '.mcs', 'meta.json'), 'utf8'));
		expect(metadata).toMatchObject({
			projectFormatVersion: 3,
			databaseSchemaVersion: 6,
			lastMigratedByMcsVersion: 'test'
		});

		const database = new Database(join(projectPath, 'mcs.db'), { readonly: true });
		expect(database.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(database.prepare("SELECT id, name FROM objects WHERE type = 'project'").get()).toEqual({
			id: manifest.id,
			name: 'Test Project'
		});
		database.close();

		const normalInspection = inspectProjectDirectory(projectPath);
		expect(normalInspection.databaseIntegrityChecked).toBe(false);
		expect(normalInspection.databaseIntegrity).toBeNull();
		expect(normalInspection.ready).toBe(true);
		const verifiedInspection = inspectProjectDirectory(projectPath, { fullIntegrity: true });
		expect(verifiedInspection.databaseIntegrityChecked).toBe(true);
		expect(verifiedInspection.databaseIntegrity).toBe('ok');
	});

	it('refuses to overwrite an existing project', () => {
		const projectPath = makeProjectPath('existing');
		initializeProjectDirectory(projectPath, { name: 'Existing', mcsVersion: 'test' });
		expect(() =>
			initializeProjectDirectory(projectPath, { name: 'Replacement', mcsVersion: 'test' })
		).toThrow('Project already exists at this path');
		const manifest = JSON.parse(readFileSync(join(projectPath, 'project.json'), 'utf8'));
		expect(manifest.name).toBe('Existing');
	});

	it('backs up an older project before upgrading its format and schema metadata', () => {
		const projectPath = makeProjectPath('older');
		initializeProjectDirectory(projectPath, { name: 'Older', mcsVersion: 'old' });
		rmSync(join(projectPath, '.mcs', 'meta.json'));

		const result = upgradeProjectDirectory(projectPath, { mcsVersion: 'test' });
		expect(result).toMatchObject({
			changed: true,
			fromVersion: 0,
			toVersion: 3,
			fromDatabaseVersion: 6,
			toDatabaseVersion: 6
		});
		expect(result.backupPath && existsSync(result.backupPath)).toBe(true);
		const metadata = JSON.parse(readFileSync(join(projectPath, '.mcs', 'meta.json'), 'utf8'));
		expect(metadata).toMatchObject({
			projectFormatVersion: 3,
			databaseSchemaVersion: 6,
			lastMigratedByMcsVersion: 'test'
		});
	});

	it('runs database upgrades idempotently and creates a recoverable metadata backup', () => {
		const projectPath = makeProjectPath('schema-upgrade');
		initializeProjectDirectory(projectPath, { name: 'Schema Upgrade', mcsVersion: 'old' });
		const metadataPath = join(projectPath, '.mcs', 'meta.json');
		writeFileSync(
			metadataPath,
			JSON.stringify({
				projectFormatVersion: 1,
				databaseSchemaVersion: 0,
				lastMigratedByMcsVersion: 'old',
				lastMigratedAt: new Date().toISOString()
			})
		);
		const database = new Database(join(projectPath, 'mcs.db'));
		database.prepare('DELETE FROM schema_migrations WHERE version > 0').run();
		database.close();

		const first = upgradeProjectDirectory(projectPath, { mcsVersion: 'test' });
		const backupEntries = readdirSync(join(projectPath, '.mcs', 'backups'));
		expect(first.changed).toBe(true);
		expect(first.metadataBackupPath && existsSync(first.metadataBackupPath)).toBe(true);
		expect(backupEntries.length).toBeGreaterThanOrEqual(2);

		const second = upgradeProjectDirectory(projectPath, { mcsVersion: 'test' });
		expect(second).toMatchObject({
			changed: false,
			toVersion: 3,
			toDatabaseVersion: 6
		});
		expect(readdirSync(join(projectPath, '.mcs', 'backups'))).toHaveLength(backupEntries.length);
	});

	it('keeps v2 legacy samples readable while adding run-scoped tables', () => {
		const projectPath = makeProjectPath('legacy-samples');
		const manifest = initializeProjectDirectory(projectPath, {
			name: 'Legacy Samples',
			mcsVersion: 'old'
		});
		const databasePath = join(projectPath, 'mcs.db');
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO streams (id, name, metadata, created_at) VALUES (?, ?, ?, ?)')
			.run('sensor:raw', 'Sensor', '{}', new Date().toISOString());
		database
			.prepare('INSERT INTO samples (stream_id, ts, payload) VALUES (?, ?, ?)')
			.run('sensor:raw', 12, JSON.stringify({ value: 34 }));

		// Rebuild the two v3-extended tables into their v2 shapes, then remove
		// the v3 migration record. This models an existing project without
		// modifying the user's real databases.
		database.pragma('foreign_keys = OFF');
		database.exec(`
			DROP INDEX IF EXISTS idx_annotations_run_ts;
			DROP INDEX IF EXISTS idx_limit_events_run_ts;
			ALTER TABLE annotations RENAME TO annotations_v3;
			CREATE TABLE annotations (
				id TEXT PRIMARY KEY,
				ts REAL NOT NULL,
				label TEXT NOT NULL,
				details TEXT DEFAULT '',
				created_at TEXT NOT NULL
			);
			INSERT INTO annotations (id, ts, label, details, created_at)
				SELECT id, ts, label, details, created_at FROM annotations_v3;
			DROP TABLE annotations_v3;
			ALTER TABLE limit_events RENAME TO limit_events_v3;
			CREATE TABLE limit_events (
				id TEXT PRIMARY KEY,
				stream_id TEXT NOT NULL,
				field TEXT NOT NULL DEFAULT 'value',
				ts REAL NOT NULL,
				value REAL NOT NULL,
				severity TEXT NOT NULL CHECK (severity IN ('yellow','red')),
				label TEXT NOT NULL DEFAULT '',
				acked_at TEXT,
				created_at TEXT NOT NULL
			);
			INSERT INTO limit_events (id, stream_id, field, ts, value, severity, label, acked_at, created_at)
				SELECT id, stream_id, field, ts, value, severity, label, acked_at, created_at FROM limit_events_v3;
			DROP TABLE limit_events_v3;
			DROP TABLE run_calibration_provenance;
			DROP TABLE run_health_metrics;
			DROP TABLE telemetry_chunks;
			DROP TABLE runs;
		`);
		database.prepare('DELETE FROM schema_migrations WHERE version >= 3').run();
		database.pragma('foreign_keys = ON');
		database.close();
		writeFileSync(
			join(projectPath, '.mcs', 'meta.json'),
			JSON.stringify({
				projectFormatVersion: 2,
				databaseSchemaVersion: 2,
				lastMigratedByMcsVersion: 'old',
				lastMigratedAt: manifest.createdAt
			})
		);

		const result = upgradeProjectDirectory(projectPath, { mcsVersion: 'test' });
		expect(result.fromDatabaseVersion).toBe(2);
		expect(result.toDatabaseVersion).toBe(6);

		const upgraded = new Database(databasePath, { readonly: true });
		expect(
			upgraded.prepare('SELECT payload FROM samples WHERE stream_id = ?').get('sensor:raw')
		).toEqual({
			payload: JSON.stringify({ value: 34 })
		});
		expect(
			upgraded
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runs'")
				.get()
		).toEqual({
			name: 'runs'
		});
		upgraded.close();
	});

	it('migrates schema 4 samples into continuous telemetry history', () => {
		const projectPath = makeProjectPath('schema-four');
		const manifest = initializeProjectDirectory(projectPath, {
			name: 'Schema Four',
			mcsVersion: 'old'
		});
		const databasePath = join(projectPath, 'mcs.db');
		const database = new Database(databasePath);
		database
			.prepare('INSERT INTO streams (id,name,metadata,created_at) VALUES (?,?,?,?)')
			.run('legacy:voltage', 'Voltage', '{}', manifest.createdAt);
		database
			.prepare('INSERT INTO samples (stream_id,ts,payload) VALUES (?,?,?)')
			.run('legacy:voltage', 1_700_000_000.125, JSON.stringify({ voltage: 11.4 }));
		database.pragma('foreign_keys = OFF');
		database.exec(`
			DROP TABLE telemetry_history;
			DROP TABLE telemetry_gaps;
			DROP TABLE source_stream_sequences;
			DROP TABLE telemetry_sources;
			DELETE FROM schema_migrations WHERE version > 4;
		`);
		database.pragma('foreign_keys = ON');
		database.close();
		writeFileSync(
			join(projectPath, '.mcs', 'meta.json'),
			JSON.stringify({
				projectFormatVersion: 3,
				databaseSchemaVersion: 4,
				lastMigratedByMcsVersion: 'old',
				lastMigratedAt: manifest.createdAt
			})
		);

		const result = upgradeProjectDirectory(projectPath, { mcsVersion: 'test' });
		expect(result.fromDatabaseVersion).toBe(4);
		expect(result.toDatabaseVersion).toBe(6);
		const upgraded = new Database(databasePath, { readonly: true });
		expect(
			upgraded
				.prepare(
					`SELECT source_id,source_time_system,event_ts,payload
			FROM telemetry_history WHERE stream_id=?`
				)
				.get('legacy:voltage')
		).toMatchObject({
			source_id: 'legacy',
			source_time_system: 'unix-utc',
			event_ts: 1_700_000_000.125,
			payload: JSON.stringify({ voltage: 11.4 })
		});
		expect(
			upgraded.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get()
		).toEqual({ version: 6 });
		upgraded.close();
	});

	it('refuses a project format created by a newer MCS version', () => {
		const projectPath = makeProjectPath('forward-version');
		initializeProjectDirectory(projectPath, { name: 'Forward Version', mcsVersion: 'future' });
		writeFileSync(
			join(projectPath, '.mcs', 'meta.json'),
			JSON.stringify({
				projectFormatVersion: 99,
				databaseSchemaVersion: 99,
				lastMigratedByMcsVersion: 'future',
				lastMigratedAt: new Date().toISOString()
			})
		);

		expect(() => upgradeProjectDirectory(projectPath)).toThrow(
			'Project format v99 requires a newer MCS version'
		);
	});

	it('rejects malformed manifests and writes valid updates atomically', () => {
		const projectPath = makeProjectPath('manifest');
		const manifest = initializeProjectDirectory(projectPath, {
			name: 'Manifest',
			mcsVersion: 'test'
		});
		writeManifest(projectPath, { ...manifest, name: 'Updated manifest' });
		expect(readManifest(projectPath)?.name).toBe('Updated manifest');
		expect(readdirSync(projectPath).some((name) => name.endsWith('.tmp'))).toBe(false);

		writeFileSync(join(projectPath, 'project.json'), '{"id":"missing-fields"}\n');
		expect(readManifest(projectPath)).toBeNull();
	});
});
