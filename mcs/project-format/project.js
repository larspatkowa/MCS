import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { BASELINE_SCHEMA_SQL, DATABASE_SCHEMA_VERSION, PROJECT_FORMAT_VERSION } from './schema.js';
import {
	assertDatabaseSchemaCurrent,
	getDatabaseSchemaVersion,
	runDatabaseMigrations,
	seedCurrentDatabaseSchema
} from './migrations.js';

/**
 * @typedef {{
 *   exists: boolean;
 *   valid: boolean;
 *   projectFormatVersion: number | null;
 *   databaseSchemaVersion: number | null;
 *   error: string | null;
 * }} MetadataInspection
 */

/** @param {string} path @param {unknown} value */
function writeJsonAtomic(path, value) {
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true });
	const temporary = join(parent, `.${randomUUID()}.tmp`);
	writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
	renameSync(temporary, path);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {string} projectPath */
function readManifestForInspection(projectPath) {
	const manifestPath = join(projectPath, 'project.json');
	if (!existsSync(manifestPath)) {
		return { manifest: null, valid: false, error: 'project.json not found' };
	}
	try {
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		const valid =
			isRecord(manifest) &&
			typeof manifest.id === 'string' &&
			manifest.id.length > 0 &&
			typeof manifest.name === 'string' &&
			manifest.name.trim().length > 0 &&
			typeof manifest.createdAt === 'string' &&
			manifest.createdAt.length > 0;
		return valid
			? { manifest, valid: true, error: null }
			: { manifest, valid: false, error: 'project.json is not a valid MCS project manifest' };
	} catch (error) {
		return {
			manifest: null,
			valid: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/** @param {string} projectPath @returns {MetadataInspection} */
function readMetadataForInspection(projectPath) {
	const metadataPath = join(projectPath, '.mcs', 'meta.json');
	if (!existsSync(metadataPath)) {
		return {
			exists: false,
			valid: false,
			projectFormatVersion: 0,
			databaseSchemaVersion: null,
			error: 'project metadata is missing'
		};
	}
	try {
		const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
		const projectFormatVersion = isRecord(metadata) ? metadata.projectFormatVersion : null;
		const databaseSchemaVersion = isRecord(metadata) ? metadata.databaseSchemaVersion : null;
		if (
			typeof projectFormatVersion !== 'number' ||
			!Number.isInteger(projectFormatVersion) ||
			projectFormatVersion < 0
		) {
			return {
				exists: true,
				valid: false,
				projectFormatVersion: null,
				databaseSchemaVersion: null,
				error: 'project format metadata is invalid'
			};
		}
		return {
			exists: true,
			valid: true,
			projectFormatVersion,
			databaseSchemaVersion:
				typeof databaseSchemaVersion === 'number' &&
				Number.isInteger(databaseSchemaVersion) &&
				databaseSchemaVersion >= 0
					? databaseSchemaVersion
					: null,
			error: null
		};
	} catch (error) {
		return {
			exists: true,
			valid: false,
			projectFormatVersion: null,
			databaseSchemaVersion: null,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/** @param {import('better-sqlite3').Database} database @param {string} name */
function hasTable(database, name) {
	return Boolean(
		database
			.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
			.get(name)
	);
}

/**
 * Inspect only the cheap project/schema checks by default. Full integrity is
 * intentionally opt-in because integrity_check walks every page in the DB.
 *
 * @param {string} projectPath
 * @param {{fullIntegrity?: boolean}} [options]
 */
function inspectDatabase(projectPath, options = {}) {
	const databasePath = join(projectPath, 'mcs.db');
	if (!existsSync(databasePath)) {
		return {
			exists: false,
			version: null,
			integrity: null,
			integrityChecked: false,
			schemaChecksPassed: false,
			rootPresent: false,
			error: 'mcs.db not found'
		};
	}

	let database;
	try {
		database = new Database(databasePath, { readonly: true, fileMustExist: true });
		const version = getDatabaseSchemaVersion(database);
		const root = hasTable(database, 'objects')
			? database
					.prepare("SELECT id FROM objects WHERE parent_id IS NULL AND type = 'project' LIMIT 1")
					.get()
			: null;
		const schemaChecksPassed =
			version !== null && hasTable(database, 'schema_migrations') && hasTable(database, 'objects');
		const integrity = options.fullIntegrity
			? String(database.pragma('integrity_check', { simple: true }))
			: null;
		return {
			exists: true,
			version,
			integrity,
			integrityChecked: options.fullIntegrity === true,
			schemaChecksPassed,
			rootPresent: Boolean(root),
			error: null
		};
	} catch (error) {
		return {
			exists: true,
			version: null,
			integrity: null,
			integrityChecked: options.fullIntegrity === true,
			schemaChecksPassed: false,
			rootPresent: false,
			error: error instanceof Error ? error.message : String(error)
		};
	} finally {
		database?.close();
	}
}

/**
 * Inspect a project without writing project files or running migrations.
 * This is shared by `mcs doctor`, `mcs open`, and the server root route.
 * Normal callers perform cheap checks; pass `{ fullIntegrity: true }` for an
 * explicit doctor/verify pass.
 *
 * @param {string} projectPath
 * @param {{fullIntegrity?: boolean}} [options]
 */
export function inspectProjectDirectory(projectPath, options = {}) {
	const normalizedPath = resolve(projectPath);
	const manifest = readManifestForInspection(normalizedPath);
	const metadata = readMetadataForInspection(normalizedPath);
	const database = inspectDatabase(normalizedPath, options);
	const formatVersion = metadata.projectFormatVersion;
	const databaseVersion = database.version;
	const metadataMatchesDatabase =
		metadata.databaseSchemaVersion !== null &&
		databaseVersion !== null &&
		metadata.databaseSchemaVersion === databaseVersion;
	const forwardIncompatible =
		(formatVersion !== null && formatVersion > PROJECT_FORMAT_VERSION) ||
		(databaseVersion !== null && databaseVersion > DATABASE_SCHEMA_VERSION) ||
		(metadata.databaseSchemaVersion !== null &&
			metadata.databaseSchemaVersion > DATABASE_SCHEMA_VERSION);
	const needsUpgrade =
		!forwardIncompatible &&
		Boolean(database.exists) &&
		(!metadata.valid ||
			formatVersion !== PROJECT_FORMAT_VERSION ||
			databaseVersion === null ||
			databaseVersion !== DATABASE_SCHEMA_VERSION ||
			!metadataMatchesDatabase);

	return {
		path: normalizedPath,
		manifest: manifest.manifest,
		manifestValid: manifest.valid,
		manifestError: manifest.error,
		metadataExists: metadata.exists,
		metadataValid: metadata.valid,
		metadataError: metadata.error,
		projectFormatVersion: formatVersion,
		metadataDatabaseSchemaVersion: metadata.databaseSchemaVersion,
		databaseExists: database.exists,
		databaseSchemaVersion: databaseVersion,
		databaseIntegrity: database.integrity,
		databaseIntegrityChecked: database.integrityChecked,
		databaseError: database.error,
		databaseSchemaChecksPassed: database.schemaChecksPassed,
		projectRootPresent: database.rootPresent,
		metadataMatchesDatabase,
		forwardIncompatible,
		needsUpgrade,
		ready:
			manifest.valid &&
			metadata.valid &&
			formatVersion === PROJECT_FORMAT_VERSION &&
			database.exists &&
			databaseVersion === DATABASE_SCHEMA_VERSION &&
			metadataMatchesDatabase &&
			database.schemaChecksPassed &&
			database.rootPresent
	};
}

/** @param {string} projectPath */
export function assertProjectCanOpen(projectPath) {
	const inspection = inspectProjectDirectory(projectPath);
	const label = inspection.path;
	if (!inspection.manifestValid) {
		throw new Error(`${inspection.manifestError ?? 'invalid project manifest'}: ${label}`);
	}
	if (inspection.metadataExists && !inspection.metadataValid) {
		throw new Error(`${inspection.metadataError ?? 'invalid project metadata'}: ${label}`);
	}
	if (
		typeof inspection.projectFormatVersion === 'number' &&
		inspection.projectFormatVersion > PROJECT_FORMAT_VERSION
	) {
		throw new Error(
			`Project format v${inspection.projectFormatVersion} requires a newer MCS version; this version supports v${PROJECT_FORMAT_VERSION}`
		);
	}
	if (
		typeof inspection.databaseSchemaVersion === 'number' &&
		inspection.databaseSchemaVersion > DATABASE_SCHEMA_VERSION
	) {
		throw new Error(
			`Database schema v${inspection.databaseSchemaVersion} requires a newer MCS version; this version supports v${DATABASE_SCHEMA_VERSION}`
		);
	}
	if (inspection.projectFormatVersion !== PROJECT_FORMAT_VERSION) {
		throw new Error(
			`Project format v${inspection.projectFormatVersion ?? 0} requires an upgrade; run mcs upgrade ${label}`
		);
	}
	if (!inspection.databaseExists) throw new Error(`mcs.db not found in ${label}`);
	if (inspection.databaseSchemaVersion === null) {
		throw new Error(`Database schema version is unavailable; run mcs upgrade ${label}`);
	}
	if (inspection.databaseSchemaVersion < DATABASE_SCHEMA_VERSION) {
		throw new Error(
			`Database schema v${inspection.databaseSchemaVersion} requires an upgrade; run mcs upgrade ${label}`
		);
	}
	if (!inspection.metadataMatchesDatabase) {
		throw new Error(
			`Project metadata and SQLite schema versions do not match; run mcs upgrade ${label}`
		);
	}
	if (!inspection.projectRootPresent) throw new Error(`Project root object is missing in ${label}`);
	return inspection;
}

/** @param {string} source @param {string} target */
function copyIfPresent(source, target) {
	if (existsSync(source)) copyFileSync(source, target);
}

/** @param {string} projectPath */
function createUpgradeBackup(projectPath) {
	const backupDirectory = join(projectPath, '.mcs', 'backups');
	mkdirSync(backupDirectory, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const prefix = `mcs-before-format-v${PROJECT_FORMAT_VERSION}-schema-v${DATABASE_SCHEMA_VERSION}-${stamp}`;
	const databasePath = join(projectPath, 'mcs.db');
	const metadataPath = join(projectPath, '.mcs', 'meta.json');
	const manifestPath = join(projectPath, 'project.json');
	const backupPath = join(backupDirectory, `${prefix}.db`);
	copyFileSync(databasePath, backupPath);
	copyIfPresent(`${databasePath}-wal`, `${backupPath}-wal`);
	copyIfPresent(`${databasePath}-shm`, `${backupPath}-shm`);
	const metadataBackupPath = existsSync(metadataPath)
		? join(backupDirectory, `${prefix}.meta.json`)
		: null;
	if (metadataBackupPath) copyFileSync(metadataPath, metadataBackupPath);
	const manifestBackupPath = existsSync(manifestPath)
		? join(backupDirectory, `${prefix}.project.json`)
		: null;
	if (manifestBackupPath) copyFileSync(manifestPath, manifestBackupPath);
	return { backupPath, metadataBackupPath, manifestBackupPath };
}

/**
 * @param {string} projectPath
 * @param {{ mcsVersion?: string }} [options]
 */
export function upgradeProjectDirectory(projectPath, options = {}) {
	const normalizedPath = resolve(projectPath);
	const inspection = inspectProjectDirectory(normalizedPath, { fullIntegrity: true });
	if (!inspection.manifestValid) {
		throw new Error(inspection.manifestError ?? 'project.json is not a valid MCS project manifest');
	}
	if (!inspection.databaseExists) throw new Error('mcs.db not found');
	if (inspection.metadataExists && !inspection.metadataValid) {
		throw new Error('Project format metadata is invalid');
	}
	if (
		typeof inspection.projectFormatVersion === 'number' &&
		inspection.projectFormatVersion > PROJECT_FORMAT_VERSION
	) {
		throw new Error(
			`Project format v${inspection.projectFormatVersion} requires a newer MCS version; this version supports v${PROJECT_FORMAT_VERSION}`
		);
	}
	if (
		typeof inspection.databaseSchemaVersion === 'number' &&
		inspection.databaseSchemaVersion > DATABASE_SCHEMA_VERSION
	) {
		throw new Error(
			`Database schema v${inspection.databaseSchemaVersion} requires a newer MCS version; this version supports v${DATABASE_SCHEMA_VERSION}`
		);
	}
	if (
		typeof inspection.metadataDatabaseSchemaVersion === 'number' &&
		inspection.metadataDatabaseSchemaVersion > DATABASE_SCHEMA_VERSION
	) {
		throw new Error(
			`Project metadata database schema v${inspection.metadataDatabaseSchemaVersion} requires a newer MCS version`
		);
	}
	if (inspection.databaseIntegrity && inspection.databaseIntegrity !== 'ok') {
		throw new Error(
			`SQLite integrity check failed before upgrade: ${inspection.databaseError ?? inspection.databaseIntegrity}`
		);
	}
	if (
		typeof inspection.metadataDatabaseSchemaVersion === 'number' &&
		typeof inspection.databaseSchemaVersion === 'number' &&
		inspection.metadataDatabaseSchemaVersion > inspection.databaseSchemaVersion
	) {
		throw new Error(
			`Project metadata reports SQLite schema v${inspection.metadataDatabaseSchemaVersion}, but the database is v${inspection.databaseSchemaVersion}; restore a backup before retrying`
		);
	}

	const fromVersion = inspection.projectFormatVersion ?? 0;
	const fromDatabaseVersion = inspection.databaseSchemaVersion ?? -1;
	const needsFormatUpgrade =
		!inspection.metadataValid ||
		fromVersion !== PROJECT_FORMAT_VERSION ||
		inspection.metadataDatabaseSchemaVersion !== DATABASE_SCHEMA_VERSION;
	const needsDatabaseUpgrade = fromDatabaseVersion !== DATABASE_SCHEMA_VERSION;
	if (!needsFormatUpgrade && !needsDatabaseUpgrade) {
		return {
			changed: false,
			fromVersion,
			toVersion: PROJECT_FORMAT_VERSION,
			fromDatabaseVersion,
			toDatabaseVersion: DATABASE_SCHEMA_VERSION
		};
	}

	const backup = createUpgradeBackup(normalizedPath);
	const databasePath = join(normalizedPath, 'mcs.db');
	let database;
	try {
		database = new Database(databasePath);
		database.pragma('journal_mode = WAL');
		database.pragma('foreign_keys = ON');
		const databaseMigration = runDatabaseMigrations(database);
		if (database.pragma('integrity_check', { simple: true }) !== 'ok') {
			throw new Error('SQLite integrity check failed after project upgrade');
		}
		database.pragma('wal_checkpoint(TRUNCATE)');
		database.close();
		database = undefined;

		writeJsonAtomic(join(normalizedPath, '.mcs', 'meta.json'), {
			projectFormatVersion: PROJECT_FORMAT_VERSION,
			databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
			lastMigratedByMcsVersion: options.mcsVersion ?? 'unknown',
			lastMigratedAt: new Date().toISOString()
		});
		return {
			changed: true,
			fromVersion,
			toVersion: PROJECT_FORMAT_VERSION,
			fromDatabaseVersion,
			toDatabaseVersion: DATABASE_SCHEMA_VERSION,
			backupPath: backup.backupPath,
			metadataBackupPath: backup.metadataBackupPath,
			manifestBackupPath: backup.manifestBackupPath,
			databaseMigration
		};
	} catch (error) {
		database?.close();
		throw error;
	}
}

/**
 * @param {string} projectPath
 * @param {{
 *   name: string;
 *   id?: string;
 *   now?: string;
 *   notes?: string;
 *   settings?: Record<string, unknown>;
 *   mcsVersion?: string;
 * }} options
 */
export function initializeProjectDirectory(projectPath, options) {
	const normalizedPath = resolve(projectPath);
	const manifestPath = join(normalizedPath, 'project.json');
	if (existsSync(manifestPath)) {
		throw new Error('Project already exists at this path');
	}

	const createdDirectory = !existsSync(normalizedPath);
	mkdirSync(normalizedPath, { recursive: true });
	const id = options.id ?? randomUUID();
	const now = options.now ?? new Date().toISOString();
	const manifest = {
		id,
		name: options.name,
		createdAt: now,
		...(options.notes ? { notes: options.notes } : {}),
		...(options.settings && Object.keys(options.settings).length > 0
			? { settings: options.settings }
			: {})
	};

	let database;
	try {
		writeJsonAtomic(manifestPath, manifest);
		database = new Database(join(normalizedPath, 'mcs.db'));
		database.pragma('journal_mode = WAL');
		database.pragma('foreign_keys = ON');
		database.exec(BASELINE_SCHEMA_SQL);
		database
			.prepare(
				`INSERT INTO objects
				 (id, type, parent_id, sort_order, name, notes, props, created_at, updated_at)
				 VALUES (?, 'project', NULL, 0, ?, ?, '{}', ?, ?)`
			)
			.run(id, options.name, options.notes ?? '', now, now);
		seedCurrentDatabaseSchema(database, now);
		database.pragma('wal_checkpoint(TRUNCATE)');
		database.close();
		database = undefined;

		writeJsonAtomic(join(normalizedPath, '.mcs', 'meta.json'), {
			projectFormatVersion: PROJECT_FORMAT_VERSION,
			databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
			lastMigratedByMcsVersion: options.mcsVersion ?? 'unknown',
			lastMigratedAt: now
		});
		return manifest;
	} catch (error) {
		database?.close();
		if (createdDirectory) {
			rmSync(normalizedPath, { recursive: true, force: true });
		} else {
			for (const generatedPath of [
				manifestPath,
				join(normalizedPath, 'mcs.db'),
				join(normalizedPath, 'mcs.db-shm'),
				join(normalizedPath, 'mcs.db-wal'),
				join(normalizedPath, '.mcs')
			]) {
				rmSync(generatedPath, { recursive: true, force: true });
			}
		}
		throw error;
	}
}

export { assertDatabaseSchemaCurrent };
