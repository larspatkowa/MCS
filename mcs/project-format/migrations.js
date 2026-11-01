import { BASELINE_SCHEMA_SQL, DATABASE_SCHEMA_VERSION, TELEMETRY_SCHEMA_SQL } from './schema.js';

/** @typedef {import('better-sqlite3').Database} SQLiteDatabase */

/**
 * Canonical SQLite migration list for generated MCS projects.
 *
 * The last version must match DATABASE_SCHEMA_VERSION. The CLI runs these
 * migrations during `mcs upgrade`; the application only checks the recorded
 * version when it opens a project.
 */
/** @type {ReadonlyArray<{version: number, name: string, up(db: SQLiteDatabase): void}>} */
export const DATABASE_MIGRATIONS = Object.freeze([
	{
		version: 0,
		name: 'baseline',
		up(db) {
			db.exec(BASELINE_SCHEMA_SQL);
		}
	},
	{
		version: 1,
		name: 'progress_bar_to_gauge',
		up(db) {
			/** @type {Array<{id: string, props: string}>} */
			const rows = /** @type {Array<{id: string, props: string}>} */ (
				db.prepare('SELECT id, props FROM objects WHERE type = ?').all('progress-bar')
			);
			const now = new Date().toISOString();
			const update = db.prepare(
				'UPDATE objects SET type = ?, props = ?, updated_at = ? WHERE id = ?'
			);
			for (const row of rows) {
				let props = {};
				try {
					props = JSON.parse(row.props || '{}');
				} catch {
					// Keep an empty property bag if a legacy object had invalid JSON.
				}
				props.displayType = 'linear';
				update.run('gauge', JSON.stringify(props), now, row.id);
			}
		}
	},
	{
		version: 2,
		name: 'add_limit_tables',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS limit_configs (
					stream_id TEXT NOT NULL,
					field TEXT NOT NULL DEFAULT 'value',
					yellow_low REAL,
					yellow_high REAL,
					red_low REAL,
					red_high REAL,
					enabled INTEGER NOT NULL DEFAULT 1,
					updated_at TEXT NOT NULL,
					PRIMARY KEY (stream_id, field)
				);

				CREATE TABLE IF NOT EXISTS limit_events (
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
				CREATE INDEX IF NOT EXISTS idx_limit_events_ts ON limit_events(ts);
				CREATE INDEX IF NOT EXISTS idx_limit_events_stream ON limit_events(stream_id, ts);
			`);
		}
	},
	{
		version: 3,
		name: 'run_scoped_chunked_telemetry',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS runs (
					id TEXT PRIMARY KEY,
					status TEXT NOT NULL CHECK (status IN ('recording', 'paused', 'finalized')),
					started_at REAL NOT NULL,
					ended_at REAL,
					paused_at REAL,
					resumed_at REAL,
					sample_count INTEGER NOT NULL DEFAULT 0,
					metadata TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
				CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_one_active
					ON runs((1)) WHERE status IN ('recording', 'paused');

				CREATE TABLE IF NOT EXISTS telemetry_chunks (
					id TEXT PRIMARY KEY,
					run_id TEXT NOT NULL,
					stream_id TEXT NOT NULL,
					kind TEXT NOT NULL DEFAULT 'raw' CHECK (kind IN ('raw', 'derived')),
					sequence INTEGER NOT NULL,
					start_ts REAL NOT NULL,
					end_ts REAL NOT NULL,
					sample_count INTEGER NOT NULL,
					encoding TEXT NOT NULL DEFAULT 'json-v1',
					payload BLOB NOT NULL,
					metadata TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL,
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
					FOREIGN KEY (stream_id) REFERENCES streams(id),
					UNIQUE (run_id, stream_id, kind, sequence)
				);
				CREATE INDEX IF NOT EXISTS idx_telemetry_chunks_run_stream_ts
					ON telemetry_chunks(run_id, stream_id, start_ts, end_ts);

				CREATE TABLE IF NOT EXISTS run_health_metrics (
					id TEXT PRIMARY KEY,
					run_id TEXT NOT NULL,
					ts REAL NOT NULL,
					metric TEXT NOT NULL,
					value REAL,
					details TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL,
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
				);
				CREATE INDEX IF NOT EXISTS idx_run_health_metrics_run_ts
					ON run_health_metrics(run_id, ts);

				CREATE TABLE IF NOT EXISTS run_calibration_provenance (
					run_id TEXT PRIMARY KEY,
					source TEXT NOT NULL,
					calibration_json TEXT NOT NULL,
					recorded_at TEXT NOT NULL,
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
				);
			`);

			/** @param {string} table @returns {string[]} */
			const columns = (table) =>
				/** @type {Array<{name: string}>} */ (db.pragma(`table_info(${table})`)).map(
					(column) => column.name
				);
			if (!columns('annotations').includes('run_id')) {
				db.exec(
					'ALTER TABLE annotations ADD COLUMN run_id TEXT REFERENCES runs(id) ON DELETE SET NULL'
				);
			}
			if (!columns('limit_events').includes('run_id')) {
				db.exec(
					'ALTER TABLE limit_events ADD COLUMN run_id TEXT REFERENCES runs(id) ON DELETE SET NULL'
				);
			}
			db.exec(`
				CREATE INDEX IF NOT EXISTS idx_annotations_run_ts ON annotations(run_id, ts);
				CREATE INDEX IF NOT EXISTS idx_limit_events_run_ts ON limit_events(run_id, ts);
			`);
		}
	},
	{
		version: 4,
		name: 'flows_media_and_render_jobs',
		up(db) {
			db.exec(`
				CREATE TABLE IF NOT EXISTS data_flows (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					source_text TEXT NOT NULL DEFAULT '',
					graph_json TEXT NOT NULL DEFAULT '{}',
					revision INTEGER NOT NULL DEFAULT 1,
					published_revision INTEGER,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				);
				CREATE TABLE IF NOT EXISTS flow_revisions (
					id TEXT PRIMARY KEY,
					flow_id TEXT NOT NULL,
					revision INTEGER NOT NULL,
					source_text TEXT NOT NULL,
					graph_json TEXT NOT NULL,
					content_hash TEXT NOT NULL,
					created_at TEXT NOT NULL,
					published_at TEXT,
					FOREIGN KEY (flow_id) REFERENCES data_flows(id) ON DELETE CASCADE,
					UNIQUE (flow_id, revision)
				);
				CREATE INDEX IF NOT EXISTS idx_flow_revisions_flow_revision
					ON flow_revisions(flow_id, revision DESC);
				CREATE TABLE IF NOT EXISTS run_flow_revisions (
					run_id TEXT NOT NULL,
					flow_id TEXT NOT NULL,
					revision INTEGER NOT NULL,
					content_hash TEXT NOT NULL,
					bound_at TEXT NOT NULL,
					PRIMARY KEY (run_id, flow_id),
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
					FOREIGN KEY (flow_id) REFERENCES data_flows(id) ON DELETE CASCADE
				);
				CREATE TABLE IF NOT EXISTS media_assets (
					id TEXT PRIMARY KEY,
					content_hash TEXT NOT NULL UNIQUE,
					relative_path TEXT NOT NULL UNIQUE,
					source_name TEXT NOT NULL,
					mime_type TEXT NOT NULL,
					byte_size INTEGER NOT NULL,
					duration_us INTEGER,
					width INTEGER,
					height INTEGER,
					fps_num INTEGER,
					fps_den INTEGER,
					audio_channels INTEGER,
					audio_sample_rate INTEGER,
					metadata TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL
				);
				CREATE TABLE IF NOT EXISTS media_run_bindings (
					id TEXT PRIMARY KEY,
					asset_id TEXT NOT NULL,
					run_id TEXT NOT NULL,
					offset_us INTEGER NOT NULL DEFAULT 0,
					rate REAL NOT NULL DEFAULT 1,
					metadata TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					FOREIGN KEY (asset_id) REFERENCES media_assets(id) ON DELETE CASCADE,
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
					UNIQUE (asset_id, run_id)
				);
				CREATE INDEX IF NOT EXISTS idx_media_run_bindings_run ON media_run_bindings(run_id);
				CREATE TABLE IF NOT EXISTS media_sync_anchors (
					id TEXT PRIMARY KEY,
					binding_id TEXT NOT NULL,
					ordinal INTEGER NOT NULL,
					media_time_us INTEGER NOT NULL,
					run_time_us INTEGER NOT NULL,
					label TEXT NOT NULL DEFAULT '',
					created_at TEXT NOT NULL,
					FOREIGN KEY (binding_id) REFERENCES media_run_bindings(id) ON DELETE CASCADE,
					UNIQUE (binding_id, ordinal)
				);
				CREATE TABLE IF NOT EXISTS render_jobs (
					id TEXT PRIMARY KEY,
					run_id TEXT,
					object_id TEXT,
					status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
					spec_json TEXT NOT NULL,
					manifest_json TEXT NOT NULL DEFAULT '{}',
					output_path TEXT,
					error TEXT,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
					FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE SET NULL
				);
				CREATE INDEX IF NOT EXISTS idx_render_jobs_updated ON render_jobs(updated_at DESC);
			`);
		}
	},
	{
		version: 5,
		name: 'continuous_time_aware_telemetry',
		up(db) {
			db.exec(TELEMETRY_SCHEMA_SQL);
			const legacy = /** @type {{name: string} | undefined} */ (
				db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'samples'").get()
			);
			if (legacy) {
				const now = Date.now() / 1000;
				db.prepare(
					`
					INSERT INTO telemetry_sources
						(id, name, time_system, timestamp_unit, created_at, updated_at)
					VALUES ('legacy', 'Legacy telemetry', 'unix-utc', 'seconds', ?, ?)
					ON CONFLICT(id) DO NOTHING
				`
				).run(new Date().toISOString(), new Date().toISOString());
				db.exec(`
					INSERT INTO telemetry_history
						(stream_id, source_id, source_timestamp, source_unit, source_time_system,
						 event_ts, received_at, payload, quality_json)
					SELECT stream_id, 'legacy', ts, 'seconds', 'unix-utc', ts, ${now}, payload,
						'{"clockQuality":"legacy-unknown"}'
					FROM samples
				`);
			}
		}
	},
	{
		version: 6,
		name: 'preserve_exact_source_timestamp_text',
		up(db) {
			const columns = /** @type {Array<{name: string}>} */ (
				db.pragma('table_info(telemetry_history)')
			).map((column) => column.name);
			if (!columns.includes('source_timestamp_raw')) {
				db.exec(
					"ALTER TABLE telemetry_history ADD COLUMN source_timestamp_raw TEXT NOT NULL DEFAULT ''"
				);
			}
			if (!columns.includes('source_timestamp_is_string')) {
				db.exec(
					'ALTER TABLE telemetry_history ADD COLUMN source_timestamp_is_string INTEGER NOT NULL DEFAULT 0'
				);
			}
			db.exec(`UPDATE telemetry_history SET source_timestamp_raw = CAST(source_timestamp AS TEXT)
				WHERE source_timestamp_raw IS NULL OR source_timestamp_raw = ''`);
			db.exec(`CREATE INDEX IF NOT EXISTS idx_telemetry_history_source_stream_event
				ON telemetry_history(source_id,stream_id,event_ts,id)`);
		}
	}
]);

if (DATABASE_MIGRATIONS.at(-1)?.version !== DATABASE_SCHEMA_VERSION) {
	throw new Error('Database migration list is out of sync with DATABASE_SCHEMA_VERSION');
}

/** @param {SQLiteDatabase} db */
export function ensureSchemaMigrationsTable(db) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL
		)
	`);
}

/**
 * @param {SQLiteDatabase} db
 * @returns {Array<{version: number, name: string, applied_at: string}>}
 */
export function readAppliedMigrations(db) {
	const table = db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
		.get();
	if (!table) return [];
	return /** @type {Array<{version: number, name: string, applied_at: string}>} */ (
		db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all()
	);
}

/** @param {SQLiteDatabase} db */
export function getDatabaseSchemaVersion(db) {
	const applied = readAppliedMigrations(db);
	if (applied.length === 0) return null;
	return Math.max(...applied.map((row) => Number(row.version)));
}

/**
 * Seed a newly-created database with the current baseline. The baseline SQL
 * already contains the current schema, so all historical migration versions
 * are recorded as satisfied without replaying legacy data transformations.
 *
 * @param {SQLiteDatabase} db
 * @param {string} appliedAt
 */
export function seedCurrentDatabaseSchema(db, appliedAt) {
	ensureSchemaMigrationsTable(db);
	const insert = db.prepare(
		'INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
	);
	const seed = db.transaction(() => {
		for (const migration of DATABASE_MIGRATIONS) {
			insert.run(migration.version, migration.name, appliedAt);
		}
	});
	seed();
}

/**
 * Apply pending migrations in one transaction. The migration history is
 * required to be contiguous so a missing row cannot silently skip a data
 * transformation.
 *
 * @param {SQLiteDatabase} db
 */
export function runDatabaseMigrations(db) {
	ensureSchemaMigrationsTable(db);
	const applied = readAppliedMigrations(db);
	const appliedVersions = new Set(applied.map((row) => Number(row.version)));
	const currentVersion = applied.length > 0 ? Math.max(...appliedVersions) : -1;
	if (currentVersion > DATABASE_SCHEMA_VERSION) {
		throw new Error(
			`Database schema v${currentVersion} requires a newer MCS version; this version supports v${DATABASE_SCHEMA_VERSION}`
		);
	}
	for (let version = 0; version <= currentVersion; version += 1) {
		if (!appliedVersions.has(version)) {
			throw new Error(`Database migration history is incomplete at v${version}`);
		}
	}

	const pending = DATABASE_MIGRATIONS.filter((migration) => migration.version > currentVersion);
	const insert = db.prepare(
		'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
	);
	const migrate = db.transaction(() => {
		for (const migration of pending) {
			migration.up(db);
			insert.run(migration.version, migration.name, new Date().toISOString());
		}
	});
	migrate();

	const lastPending = pending[pending.length - 1];
	return {
		fromVersion: currentVersion,
		toVersion: lastPending ? lastPending.version : currentVersion,
		changed: pending.length > 0
	};
}

/** @param {SQLiteDatabase} db */
export function assertDatabaseSchemaCurrent(db) {
	const version = getDatabaseSchemaVersion(db);
	if (version === null) {
		throw new Error(
			`Database schema version is unavailable; run mcs upgrade for this project before opening it`
		);
	}
	if (version > DATABASE_SCHEMA_VERSION) {
		throw new Error(
			`Database schema v${version} requires a newer MCS version; this version supports v${DATABASE_SCHEMA_VERSION}`
		);
	}
	if (version < DATABASE_SCHEMA_VERSION) {
		throw new Error(
			`Database schema v${version} requires an upgrade; run mcs upgrade for this project`
		);
	}
	return version;
}
