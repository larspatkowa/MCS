import { defineConfig } from '@playwright/test';

const port = Number(process.env.DOCS_E2E_PORT ?? 4174);

export default defineConfig({
	webServer: {
		command: `rm -rf .svelte-kit/output build && npm run build && PORT=${port} npm run preview`,
		port,
		// Always start our own server so a stray dev server on the same port
		// can't make the audit suite talk to the wrong app.
		reuseExistingServer: false
	},
	testDir: 'e2e',
	use: {
		baseURL: `http://localhost:${port}`
	}
});
