import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';
import { runMigrations } from './migrations.js';

const DB_FILENAME = 'mcs.db';

const dbCache = new Map<string, Database.Database>();
const migratedPaths = new Set<string>();

function dbPath(projectPath: string): string {
	return join(projectPath, DB_FILENAME);
}

export function getDb(projectPath: string): Database.Database {
	const path = dbPath(projectPath);
	let db = dbCache.get(path);
	if (!db) {
		db = new Database(path);
		db.pragma('journal_mode = WAL');
		dbCache.set(path, db);
	}
	if (!migratedPaths.has(path)) {
		runMigrations(db);
		migratedPaths.add(path);
	}
	return db;
}

export function projectDbExists(projectPath: string): boolean {
	return existsSync(dbPath(projectPath));
}
