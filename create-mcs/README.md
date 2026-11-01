# create-mcs

Create a portable MCS telemetry project:

```bash
npm create mcs@latest my-project
cd my-project
npm run dev -- --open
```

The generator creates a blank project with a portable manifest and SQLite run store.

The generated directory owns its project manifest, SQLite database, package lock, and MCS dependency. `package.json` declares the allowed runtime range and the generated lockfile pins the installed runtime. Run `npm run doctor` to validate it. Run `npm update mcs-platform` to change the runtime dependency, then `mcs upgrade .` to apply explicit project-format and SQLite migrations with a backup. `npm run update` is the generated wrapper for those two steps.
