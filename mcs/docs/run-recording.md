# Run recording contract

Run lifecycle state is stored per project. A project has at most one active
recording or paused run.

Start a run:

```http
POST /api/projects/:projectId/runs
Content-Type: application/json

{"action":"start","metadata":{"source":"capture-bridge"}}
```

Pause, resume, or finalize the returned run:

```http
POST /api/projects/:projectId/runs/:runId
Content-Type: application/json

{"action":"pause"}
```

Use `resume` or `stop` for the other lifecycle transitions. `GET
/api/projects/:projectId/runs` returns the active run and a bounded recent run
list. `GET /api/projects/:projectId/runs/:runId` returns the run and its health
metrics.

The existing batch ingest contract remains valid:

```http
POST /api/ingest/batch
Content-Type: application/json

{"projectId":"...","samples":[{"streamId":"sensor:raw","timestamp":123,"values":{"value":42}}]}
```

When the project has an active recording run, the server associates a batch
without `runId` with that run. An acquisition bridge may additionally send
`"runId":"..."` in the same body; it must identify the active recording run.
A batch without `runId` and without an active recording run goes only to the
bounded process-local live preview and is not appended to the durable
telemetry tables. A stale or unknown optional `runId` is rejected rather than
silently attached to another run.

Replay is explicit and bounded per stream/kind series:

```http
GET /api/projects/:projectId/runs/:runId/replay?limit=2000&streamId=sensor%3Araw
```

Optional `start`, `end`, and `limit` query parameters restrict the replay
window. The response contains the selected run and peak-preserving sampled
series; it does not return samples from other runs or the entire general
telemetry table.
