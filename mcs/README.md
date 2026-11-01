# MCS

MCS is a local-first telemetry console for live and historical data. It records
continuous SQLite history, preserves source clock provenance, stores named runs,
and gives plots, tables, and run playback one shared time conductor.

## Development

From this directory:

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The server listens on loopback by default. A
project is created only after an explicit action.

## Data boundary

Suppliers own capture hardware, device clocks, and raw recording. They send
normalized samples through `/api/ingest` or import a run package. MCS owns
validation, SQLite storage, replay, displays, layouts, media synchronization,
and export. Raw samples are never replaced by derived values.

Single-sample ingest:

```bash
curl -X POST http://127.0.0.1:5173/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"PROJECT_ID","streamId":"sensor:temperature","timestamp":1786137600,"values":{"value":22.5}}'
```

Batch ingest accepts at most 5,000 validated samples. Run import accepts CSV,
JSON, and NDJSON packages with bounded size and sample counts. A run contains
raw events, stream metadata, capture metadata, schema information, and
integrity metadata. Legacy samples remain readable during migration.

Versioned acquisition uses `POST /api/ingest/v2`. Each envelope identifies one
project and source; each sample includes the raw source timestamp and time
system, optional sequence and idempotency key, values, quality, and provenance.
Decimal strings preserve integer timestamps beyond JavaScript's safe integer
range. MCS stores that source time beside receive time and normalized UTC event
time. UTC/Unix UTC, GPS seconds from the GPS epoch, and Unix-aligned TAI are
supported directly; other epochs require an explicit adapter. Per-source
offset, drift, uncertainty, expected sample period, and freshness settings are
available at `/api/projects/:id/sources/:sourceId`. The hardware owner remains
responsible for clock discipline.

`GET /api/projects/:id/telemetry/metadata` lists provider capabilities and
source stream metadata. Bounded history queries use
`GET /api/projects/:id/telemetry/history?sourceId=...&streamId=...&from=...&to=...&resolution=raw&maxSamples=...`.
Raw pages return a cursor; `resolution=minmax&field=value` preserves per-window
extrema for a numeric field, and `resolution=latest` returns the newest sample
in the requested interval. Existing stream sample and SSE endpoints remain
available for compatibility. A local SQLite historian is the initial provider;
continuous history defaults to 30 days and can be configured per project from
1 to 3,650 days. Named run recordings have their own retention.

The legacy stream samples endpoint accepts `includeReceivedAt=1` for the
server receipt time used by freshness indicators. It is separate from the
normalized event timestamp and is absent unless requested.

Live plots and gauges use SSE for prompt updates and a cursor-based REST
refresh as a reconnect fallback. The fallback defaults to 1,000 ms and can be
changed per display in its properties; values are bounded to 100–60,000 ms.
This controls how quickly a display recovers missed events, not how often an
instrument samples. Configure the source's `expectedPeriodMs` in the Sources
status panel (or source API) to match the acquisition cadence; MCS uses it for
source stale detection. Sequence gaps are reported when the source supplies
sequence numbers. Receive time drives freshness, while normalized event time
drives ordering. Late samples remain in history and do not move a live scalar
gauge backward.

MCS does not implement Open MCT's server protocol. The MCS provider contract
supports the same metadata, live, history, and resolution concerns, and the
[`Open MCT adapter`](docs/OPEN_MCT_INTEGRATION.md) maps those APIs into an
Open MCT telemetry provider for read-only integration.

## Replay, media, and export

There is one replay clock. Charts, tables, gauges, layouts, video, and render
jobs observe its playhead. Images use the same project-owned media store as
video, while remaining static displays. Media is a timestamped track with a
file source, duration, optional audio metadata, and a run-to-media
synchronization offset.

Render jobs always retain a deterministic PNG frame sequence and manifest. If
`ffmpeg` is available they may also produce H.264 or ProRes; an unavailable or
failed encoder is reported as such and never presented as a successful video.
See [`docs/replay-media-render.md`](docs/replay-media-render.md) for the small
integration surface.

Derived values use a validated, serializable list of bounded operations
(scale, offset, logarithm, clamp, derivative, integral, moving average,
min/max, resampling, and alignment). They do not execute user code.

## Project files

```text
project.json       Project identity and settings
mcs.db             Objects, streams, runs, samples, media, and annotations
.mcs/meta.json     Project and database schema versions
.mcs/media/        Content-addressed imported media
.mcs/renders/      Render manifests and frame sequences
```

The server owns SQLite writes and serves resumable live updates over SSE.
Project migrations are explicit and write recoverable backups before changing
schema. `mcs backup [project-directory] [backup-directory]` creates a
hash-verified directory backup that includes project metadata, SQLite data, and
media while excluding local runtime credentials. `mcs restore <backup-directory> <new-project-directory>` verifies hashes and database integrity and restores
only into a new or empty destination.

## Operator setup and sample projects

The default `mcs open <project>` config lives at `<project>/.mcs/runtime/`.
For one shared MCS configuration and brand across projects, set an absolute
`MCS_CONFIG_DIR` before opening each project, for example
`MCS_CONFIG_DIR=/path/to/mcs-config mcs open ./flight-demo`. Add `branding/branding.css` and
font files under `branding/fonts/`; MCS serves this stylesheet after its built-in
theme. See [`docs/THEMING.md`](docs/THEMING.md) for the font-face example and
supported file types.

Create the offline flight-system starter with:

```bash
mcs create flight-demo --template flight-system
cd flight-demo
npm install
npm run dev -- --open
```

It opens directly on a split overview with recent synthetic flight, propulsion,
avionics, and attitude telemetry. Plots and gauges start with a 1-second
fallback refresh; the overview uses a flex layout that can be resized with its
splitters. To add live simulated samples, run
`npm run demo:telemetry` in a second terminal. The simulator only posts local
telemetry; it is opt-in and sends no commands.

## Remote access

Loopback use does not require accounts. For a multi-user deployment, set a
one-time bootstrap secret, enable account authentication, and keep MCS behind a
TLS-terminating HTTPS proxy:

```bash
export MCS_AUTH_REQUIRED=1
export MCS_BOOTSTRAP_TOKEN="$(openssl rand -base64 32)"
mcs open ./project --host 0.0.0.0 --allow-remote
```

Open `/login` to create the first administrator. Administrators provision
accounts and project memberships through `/api/admin/users` and
`/api/admin/projects/:id/members`. Project administrators create and revoke
source-specific acquisition tokens through `/api/projects/:id/tokens`; send
those tokens as Bearer credentials to `/api/ingest/v2`. Sessions are stored as
hashes, use secure HTTP-only cookies, and project reads and writes are checked
against membership. `/api/health` reports liveness;
`/api/health/ready` reports database, source-freshness, and authentication
readiness. Vehicle commands are outside this release: MCS has no command route,
registry, or executor. The type-only provider boundary waits for a concrete
adapter and host authorization policy.

## Checks

```bash
npm run check
npm run test:unit
npm run build
```

Browser verification uses the headed Playwright workflow in the repository.
