# Replay, media, and rendering

MCS has one replay clock. A loaded run configures its start, end, playhead,
speed, loop, and frame rate. Displays and layouts read the same clock; they do
not maintain private playback state.

## Runs

Use the cursor-paged event endpoint when a consumer needs every event:

```http
GET /api/projects/:projectId/runs/:runId/events?limit=50000
```

The response contains raw and derived events, `hasMore`, and an opaque cursor.
The chart-sized `/replay` endpoint is bounded for interactive views. Imports
from CSV, JSON, and NDJSON create a finalized run transactionally. Raw values
remain authoritative; derived values are separate events with serializable
provenance.

## Media tracks

Imported media is content-addressed under `.mcs/media/`. A binding connects an
asset to a run with an offset, rate, and optional timestamp anchors. The
canonical track contains the file source, start time, duration, sync offset,
frame rate, and audio metadata. Video frame lookup receives the replay
timestamp and returns the mapped media time and frame index.

## Export

Render jobs seek the shared clock for each frame and write a manifest plus PNG
sequence under `.mcs/renders/`. The sequence is retained even when no encoder
is installed. An available `ffmpeg` may encode H.264 or ProRes; missing or
failed encoders leave the job visibly unavailable/failed and no video output
path is reported.

All inputs are bounded and validated before a job starts. Frame and output
routes expose only project-contained files, never arbitrary filesystem paths.
