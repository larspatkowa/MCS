# Mission Control System (MCS)

Browser-based telemetry and mission control with Svelte and SQLite.

## Get started

Pick one.

### Run from source

```bash
git clone https://github.com/larspatkowa/MCS.git
cd MCS
npm install
npm --prefix mcs run dev
```

Open `http://localhost:6000`. On first launch MCS auto-creates a Rocket Mission Demo project so there is live data immediately.

### Run globally (CLI)

After installing dependencies once at the repo root (`npm install`), link or install the `mcs` package so the `mcs` command is on your `PATH`:

```bash
npm install -g ./mcs
mcs
```

This starts the dev server at `http://localhost:6000` (override with `PORT=7000 mcs` or `mcs -- --port 7000`). Data still lives under `mcs/data/` in your clone.

### Run with Docker

```bash
docker compose -f docker/docker-compose.yml up
```

Open `http://localhost:6000`. Projects persist in `mcs/data/`.

## Projects

A project is a folder with `project.json`, `mcs.db`, and `.mcs/meta.json`. Projects are created and opened from the project picker in the running app, or via `POST /api/projects`. There is no external scaffolding step.

## What you can do

- **Ingest telemetry**: POST JSON to `/api/ingest` and visualize streams (plots, gauges, tables, maps)
- **Projects are folders**: each project is portable, no external database required
- **Extend with plugins**: add in-process or out-of-process data sources

## Customize

- **Plugin SDK**: see [`mcs/src/lib/server/plugin-sdk/`](mcs/src/lib/server/plugin-sdk/)
- **Project format**:
  - `project.json`: project manifest
  - `mcs.db`: SQLite database (objects, streams, samples, limits)
  - `.mcs/meta.json`: project format and the last migrated tool version
- **Theming**: CSS variables in `mcs/src/lib/styles/theme.css` (see `.cursor/rules/theme-and-tailwind.mdc` for constraints)

## Develop

- App docs: [`mcs/README.md`](mcs/README.md)

## License

MIT. See [`LICENSE`](LICENSE).
