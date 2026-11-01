# Release checklist

Use this checklist for every `create-mcs` and `mcs-platform` release.

## Candidate verification

- Use the current Node.js 22 LTS release.
- Start from a clean install with `npm ci`.
- Run `npm run verify:release`.
- Confirm `npm audit --omit=dev` reports no vulnerabilities.
- Run `npm pack --dry-run --workspace mcs-platform` and `npm pack --dry-run --workspace create-mcs`.
- Confirm source maps, test fixtures, local data, and generated projects are absent from both packages.
- Create a project from the packed artifacts in a temporary directory.
- Start, stop, restart, ingest a sample, query it, and run `npm run doctor`.
- Confirm a non-loopback bind fails without `--allow-remote`.

## Browser acceptance

- Create and open a blank project from `/projects`.
- Confirm the project tree, center view, properties, timeline, settings, and command palette work with mouse and keyboard.
- Verify light and dark themes at desktop, tablet, and narrow viewport sizes.
- Exercise telemetry ingest, live update, export, import, replay, pause, and speed controls.
- Check the supported object and API documentation routes for broken links, browser errors, and focus traps.
- Verify the narrow adapter boundary with normalized samples and imported run packages. Hardware capture fidelity remains the supplier's responsibility.

## Publication

- Review the changelog, README, license, font licenses, and security policy.
- Confirm package names and versions on the npm registry.
- Publish `mcs-platform` before `create-mcs`.
- Install both packages from the public registry in a fresh temporary directory.
- Tag the exact verified commit and create release notes from the changelog.
