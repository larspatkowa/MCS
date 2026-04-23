# Mission Control System (MCS)

> **Status: In Development**

A browser-based mission control and telemetry dashboard for rocketry clubs, student teams, and hobbyists. Built with SvelteKit + SQLite. Inspired by NASA's OpenMCT.

MCS lets you visualize live sensor data — altitude, velocity, temperature, GPS position, and more — on customizable dashboards with line plots, gauges, maps, orbital tracks, and 20+ other view types. No external databases or cloud services required.

---

## Quick Start (5 minutes)

```sh
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Open [http://localhost:6000](http://localhost:6000).

### Try the Rocket Mission Demo

1. If you have no recent projects yet, MCS creates **Rocket Mission Demo** automatically — open it from the picker.
2. Or under **Create project** expand **Example projects** and choose **Rocket Mission**, **Agriculture**, or **System Monitor**, or open the pre-made **Rocket Mission Demo** if it is already in your list.
3. Rocket simulation auto-starts when the project has `settings.autoStartPlugins` set (templates and the first-run demo do this). Otherwise open **Settings → Data sources** and start **Rocket Mission**.
4. Watch live telemetry populate **Mission layout** — altitude, velocity, fuel levels, GPS track, and more

The demo simulates a 10-minute multi-stage orbital launch cycle that repeats automatically.

Creating an **example project** starts a short tour for that example. With a project open, select the project root for **Take a project tour**, **Try a demo**, and **Connect your data**.

---

## How Data Gets In

MCS has two ways to receive telemetry:

### Option A: Send data via HTTP (easiest for beginners)

Post a JSON payload to the ingest endpoint. Works from any language — Python, Arduino, curl:

```bash
# Send one temperature reading
curl -X POST http://localhost:6000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "streamId": "my-sensor:temperature",
    "values": { "value": 22.5 }
  }'
```

```python
# Python example — read a serial sensor and send to MCS
import requests, time

while True:
    temp = read_sensor()  # your sensor code here
    requests.post("http://localhost:6000/api/ingest", json={
        "projectId": "YOUR_PROJECT_ID",
        "streamId": "my-sensor:temperature",
        "values": {"value": temp}
    })
    time.sleep(1)
```

Your project ID is shown in the URL when you open a project: `localhost:6000/project/<project-id>`.

### Option B: Extend MCS with a plugin (power users)

In-process plugins run inside the SvelteKit server: they can declare streams, scaffold dashboard objects, and push data automatically. In the UI this appears under **Settings → Data sources**. See the [first plugin tutorial](http://localhost:5174/tutorials/first-plugin) in the docs.

---

## Project Structure

```
mcs/
├── data/
│   ├── config.json          # Recent projects list
│   └── projects/             # Each project = a folder with project.json + mcs.db
├── src/
│   ├── lib/
│   │   ├── components/       # All UI components (views, layout, tree, properties)
│   │   ├── charts/           # Client-side sample data generators
│   │   ├── objects/          # Object type definitions and registry
│   │   └── server/           # Backend: ingest, SQLite, plugins, SSE
│   └── routes/               # SvelteKit pages + REST API endpoints
└── static/                   # Static assets
```

### Key Concepts

| Concept         | What it means                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| **Project**     | A folder containing `project.json` + `mcs.db`. All your data lives here.                              |
| **Object**      | Anything in the sidebar tree — a folder, a chart, a gauge, a layout panel.                            |
| **Stream**      | A named channel of telemetry (e.g. `rocket:altitude`). Streams carry timestamped values.              |
| **Data source** | Built-in simulation, spawned connector, or your HTTP client. Server APIs still use the term “plugin”. |
| **Layout**      | A container (Flex Layout, Grid Layout, or Tab Layout) that arranges objects into a dashboard.         |

---

## Available Scripts

| Command           | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `npm run dev`     | Start dev server at localhost:6000                                  |
| `npm run devh`    | Start dev server with network access (for testing on other devices) |
| `npm run build`   | Production build                                                    |
| `npm run preview` | Preview production build locally                                    |
| `npm run test`    | Run unit + e2e tests                                                |
| `npm run check`   | TypeScript + Svelte type checking                                   |

---

## Documentation

Full docs with tutorials, component reference, and API guide:

```sh
cd ../docs-site
npm install
npm run dev
```

Opens at [http://localhost:5174](http://localhost:5174).

---

## License

MIT
