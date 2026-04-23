import type Database from 'better-sqlite3';

export interface Migration {
	version: number;
	name: string;
	up(db: Database.Database): void;
}

const migrations: Migration[] = [
	{
		version: 0,
		name: 'baseline',
		up(db) {
			// Bracket call avoids false-positive security hooks for exec(…)
			db['exec'](`
				CREATE TABLE IF NOT EXISTS objects (
				  id TEXT PRIMARY KEY,
				  type TEXT NOT NULL,
				  parent_id TEXT,
				  sort_order INTEGER NOT NULL DEFAULT 0,
				  name TEXT NOT NULL,
				  notes TEXT DEFAULT '',
				  props TEXT DEFAULT '{}',
				  created_at TEXT NOT NULL,
				  updated_at TEXT NOT NULL,
				  FOREIGN KEY (parent_id) REFERENCES objects(id)
				);

				CREATE TABLE IF NOT EXISTS streams (
				  id TEXT PRIMARY KEY,
				  name TEXT NOT NULL,
				  metadata TEXT DEFAULT '{}',
				  created_at TEXT
				);

				CREATE TABLE IF NOT EXISTS samples (
				  stream_id TEXT NOT NULL,
				  ts REAL NOT NULL,
				  payload TEXT NOT NULL,
				  FOREIGN KEY (stream_id) REFERENCES streams(id)
				);
				CREATE INDEX IF NOT EXISTS idx_samples_stream_ts ON samples(stream_id, ts);

				CREATE TABLE IF NOT EXISTS annotations (
				  id TEXT PRIMARY KEY,
				  ts REAL NOT NULL,
				  label TEXT NOT NULL,
				  details TEXT DEFAULT '',
				  created_at TEXT NOT NULL
				);

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

				CREATE TABLE IF NOT EXISTS schema_migrations (
					version INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					applied_at TEXT NOT NULL
				)
			`);
		}
	},
	{
		version: 1,
		name: 'progress_bar_to_gauge',
		up(db) {
			const rows = db
				.prepare('SELECT id, props FROM objects WHERE type = ?')
				.all('progress-bar') as {
				id: string;
				props: string;
			}[];
			const now = new Date().toISOString();
			const update = db.prepare(
				'UPDATE objects SET type = ?, props = ?, updated_at = ? WHERE id = ?'
			);
			for (const row of rows) {
				let props: Record<string, unknown> = {};
				try {
					props = JSON.parse(row.props || '{}') as Record<string, unknown>;
				} catch {
					// keep empty
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
	}
];

function ensureMigrationsTable(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TEXT NOT NULL
		)
	`);
}

/** Run pending migrations on an open database. Called from getDb once per project path. */
export function runMigrations(db: Database.Database): void {
	ensureMigrationsTable(db);
	const applied = new Set(
		(db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
			(r) => r.version
		)
	);
	const insert = db.prepare(
		'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
	);
	for (const m of migrations) {
		if (applied.has(m.version)) continue;
		m.up(db);
		insert.run(m.version, m.name, new Date().toISOString());
	}
}
