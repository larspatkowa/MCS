/**
 * Version boundaries for data owned by a generated project.
 *
 * The runtime package version is intentionally kept in package.json. These
 * values describe the on-disk project format and SQLite schema only; they are
 * not SemVer aliases and must not be changed by an npm package release alone.
 */
export const PROJECT_FORMAT_VERSION = 3;
export const DATABASE_SCHEMA_VERSION = 6;

export const TELEMETRY_SCHEMA_SQL = `
	CREATE TABLE IF NOT EXISTS telemetry_sources (
	  id TEXT PRIMARY KEY,
	  name TEXT NOT NULL,
	  time_system TEXT NOT NULL DEFAULT 'unix-utc',
	  timestamp_unit TEXT NOT NULL DEFAULT 'seconds' CHECK (timestamp_unit IN ('seconds','milliseconds','microseconds','nanoseconds')),
	  clock_offset_seconds REAL NOT NULL DEFAULT 0,
	  clock_drift_ppm REAL NOT NULL DEFAULT 0,
	  clock_reference_source_seconds REAL NOT NULL DEFAULT 0,
	  clock_uncertainty_ms REAL,
	  expected_period_ms INTEGER,
	  last_received_at REAL,
	  last_event_at REAL,
	  last_sequence INTEGER,
	  missing_sequence_count INTEGER NOT NULL DEFAULT 0,
	  created_at TEXT NOT NULL,
	  updated_at TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS source_stream_sequences (
	  source_id TEXT NOT NULL,
	  stream_id TEXT NOT NULL,
	  max_sequence INTEGER NOT NULL,
	  PRIMARY KEY (source_id, stream_id),
	  FOREIGN KEY (source_id) REFERENCES telemetry_sources(id) ON DELETE CASCADE,
	  FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS telemetry_gaps (
	  id TEXT PRIMARY KEY,
	  source_id TEXT NOT NULL,
	  stream_id TEXT NOT NULL,
	  first_missing_sequence INTEGER NOT NULL,
	  last_missing_sequence INTEGER NOT NULL,
	  detected_at REAL NOT NULL,
	  resolved_at REAL,
	  CHECK (last_missing_sequence >= first_missing_sequence),
	  FOREIGN KEY (source_id) REFERENCES telemetry_sources(id) ON DELETE CASCADE,
	  FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_telemetry_gaps_source_open
	  ON telemetry_gaps(source_id, stream_id, resolved_at, first_missing_sequence);

	CREATE TABLE IF NOT EXISTS telemetry_history (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  stream_id TEXT NOT NULL,
	  source_id TEXT NOT NULL,
	  source_timestamp REAL NOT NULL,
	  source_timestamp_raw TEXT NOT NULL DEFAULT '',
	  source_timestamp_is_string INTEGER NOT NULL DEFAULT 0 CHECK (source_timestamp_is_string IN (0,1)),
	  source_unit TEXT NOT NULL,
	  source_time_system TEXT NOT NULL,
	  event_ts REAL NOT NULL,
	  received_at REAL NOT NULL,
	  source_sequence INTEGER,
	  idempotency_key TEXT,
	  payload TEXT NOT NULL,
	  quality_json TEXT NOT NULL DEFAULT '{}',
	  run_id TEXT,
	  FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE,
	  FOREIGN KEY (source_id) REFERENCES telemetry_sources(id),
	  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
	);
	CREATE INDEX IF NOT EXISTS idx_telemetry_history_stream_event
	  ON telemetry_history(stream_id, event_ts, id);
	CREATE INDEX IF NOT EXISTS idx_telemetry_history_source_stream_event
	  ON telemetry_history(source_id, stream_id, event_ts, id);
	CREATE INDEX IF NOT EXISTS idx_telemetry_history_source_receive
	  ON telemetry_history(source_id, received_at DESC);
	CREATE INDEX IF NOT EXISTS idx_telemetry_history_received
	  ON telemetry_history(received_at, id);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_history_source_sequence
	  ON telemetry_history(source_id, stream_id, source_sequence)
	  WHERE source_sequence IS NOT NULL;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_history_idempotency_key
	  ON telemetry_history(source_id, idempotency_key)
	  WHERE idempotency_key IS NOT NULL;
`;

export const BASELINE_SCHEMA_SQL = `
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

	CREATE TABLE IF NOT EXISTS samples (
	  stream_id TEXT NOT NULL,
	  ts REAL NOT NULL,
	  payload TEXT NOT NULL,
	  FOREIGN KEY (stream_id) REFERENCES streams(id)
	);
	CREATE INDEX IF NOT EXISTS idx_samples_stream_ts ON samples(stream_id, ts);

	CREATE TABLE IF NOT EXISTS annotations (
	  id TEXT PRIMARY KEY,
	  run_id TEXT,
	  ts REAL NOT NULL,
	  label TEXT NOT NULL,
	  details TEXT DEFAULT '',
	  created_at TEXT NOT NULL,
	  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
	);
	CREATE INDEX IF NOT EXISTS idx_annotations_run_ts ON annotations(run_id, ts);

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
	  run_id TEXT,
	  stream_id TEXT NOT NULL,
	  field TEXT NOT NULL DEFAULT 'value',
	  ts REAL NOT NULL,
	  value REAL NOT NULL,
	  severity TEXT NOT NULL CHECK (severity IN ('yellow','red')),
	  label TEXT NOT NULL DEFAULT '',
	  acked_at TEXT,
	  created_at TEXT NOT NULL,
	  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
	);
	CREATE INDEX IF NOT EXISTS idx_limit_events_ts ON limit_events(ts);
	CREATE INDEX IF NOT EXISTS idx_limit_events_stream ON limit_events(stream_id, ts);
	CREATE INDEX IF NOT EXISTS idx_limit_events_run_ts ON limit_events(run_id, ts);

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

	CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		name TEXT NOT NULL,
		applied_at TEXT NOT NULL
	);

	${TELEMETRY_SCHEMA_SQL}
`;
