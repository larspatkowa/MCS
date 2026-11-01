import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { assertSchemaCurrent } from './migrations.js';
import { inspectProjectDirectory } from '../../../project-format/project.js';
import { PROJECT_FORMAT_VERSION } from '../../../project-format/schema.js';

const DB_FILENAME = 'mcs.db';

const dbCache = new Map<string, Database.Database>();

function dbPath(projectPath: string): string {
	return join(projectPath, DB_FILENAME);
}

export function getDb(projectPath: string): Database.Database {
	const path = dbPath(projectPath);
	let db = dbCache.get(path);
	if (!db) {
		const inspection = inspectProjectDirectory(projectPath);
		if (inspection.metadataExists && !inspection.metadataValid) {
			throw new Error(`${inspection.metadataError ?? 'invalid project metadata'}: ${projectPath}`);
		}
		if (inspection.projectFormatVersion !== PROJECT_FORMAT_VERSION) {
			throw new Error(
				`Project format v${inspection.projectFormatVersion ?? 0} requires an upgrade; run mcs upgrade ${projectPath}`
			);
		}
		if (!existsSync(path)) throw new Error(`mcs.db not found in ${projectPath}`);
		if (!inspection.metadataMatchesDatabase) {
			throw new Error(
				`Project metadata and SQLite schema versions do not match; run mcs upgrade ${projectPath}`
			);
		}
		const readonly = new Database(path, { readonly: true, fileMustExist: true });
		try {
			assertSchemaCurrent(readonly);
		} finally {
			readonly.close();
		}
		db = new Database(path);
		db.pragma('journal_mode = WAL');
		// In WAL mode NORMAL never corrupts the database; a power cut can lose
		// only the last few commits, and it removes an fsync from every ingest.
		db.pragma('synchronous = NORMAL');
		db.pragma('busy_timeout = 5000');
		db.pragma('foreign_keys = ON');
		cacheStatements(db);
		dbCache.set(path, db);
	}
	return db;
}

const MAX_CACHED_STATEMENTS = 512;

/**
 * Reuse compiled statements. Callers prepare SQL inline at every call, which
 * recompiled the ingest statements on every request. No caller changes a
 * statement's mode (pluck/raw/expand) or iterates one, so sharing is safe.
 */
function cacheStatements(db: Database.Database): void {
	const prepare = db.prepare.bind(db);
	const statements = new Map<string, Database.Statement>();
	db.prepare = ((sql: string) => {
		let statement = statements.get(sql);
		if (!statement) {
			if (statements.size >= MAX_CACHED_STATEMENTS) statements.clear();
			statement = prepare(sql);
			statements.set(sql, statement);
		}
		return statement;
	}) as typeof db.prepare;
}

export function projectDbExists(projectPath: string): boolean {
	return existsSync(dbPath(projectPath));
}

export function closeProjectDb(projectPath: string): void {
	const path = dbPath(projectPath);
	const database = dbCache.get(path);
	if (database) {
		database.close();
		dbCache.delete(path);
	}
}

export function closeAllProjectDbs(): void {
	for (const database of dbCache.values()) database.close();
	dbCache.clear();
}
