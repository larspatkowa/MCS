import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const e2eRoot = resolve('.mcs-e2e');
const configuredPort = Number(process.env.MCS_E2E_PORT ?? 4173);
const port =
	Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535
		? configuredPort
		: 4173;

export default defineConfig({
	webServer: {
		command: `npm run build && npm run preview -- --port ${port}`,
		port,
		// The command includes a full production build, which can exceed the 60 s default.
		timeout: 180_000,
		env: {
			MCS_CONFIG_DIR: e2eRoot,
			MCS_PROJECTS_DIR: resolve(e2eRoot, 'projects')
		}
	},
	testDir: 'e2e',
	outputDir: 'test-results',
	globalTeardown: './e2e/global-teardown',
	workers: 2,
	use: { baseURL: `http://localhost:${port}` }
});
