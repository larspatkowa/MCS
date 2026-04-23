import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	timeout: 60000,
	outputDir: 'test-results',
	globalTeardown: './e2e/global-teardown',
	use: { baseURL: 'http://localhost:6000' }
});
