import type Database from 'better-sqlite3';
import {
	assertDatabaseSchemaCurrent,
	getDatabaseSchemaVersion,
	runDatabaseMigrations
} from '../../../project-format/migrations.js';

/**
 * The executable migration list lives in project-format/migrations.js so the
 * packaged CLI and the SvelteKit server cannot drift apart. The server keeps
 * this compatibility wrapper for existing imports and tests.
 */
export function runMigrations(db: Database.Database): ReturnType<typeof runDatabaseMigrations> {
	return runDatabaseMigrations(db);
}

export function getSchemaVersion(db: Database.Database): number | null {
	return getDatabaseSchemaVersion(db);
}

export function assertSchemaCurrent(db: Database.Database): number {
	return assertDatabaseSchemaCurrent(db);
}
