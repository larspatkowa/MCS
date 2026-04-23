import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clearConfigCache } from '$lib/server/config';
import { createProject } from '$lib/server/project';

const TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'mcs-api-test-config-'));
const TEST_PROJECTS_BASE = mkdtempSync(join(tmpdir(), 'mcs-api-test-projects-'));

function makeEvent(url: string, params: Record<string, string> = {}) {
	return {
		params,
		getClientAddress: () => '',
		cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
		fetch: globalThis.fetch,
		isDataRequest: false,
		isSubRequest: false,
		locals: {},
		platform: undefined,
		request: new Request(url),
		route: { id: '' },
		setHeaders: () => {},
		url: new URL(url)
	} as any;
}

describe('API plugin catalog', () => {
	let projectId = '';

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = TEST_CONFIG_DIR;
		clearConfigCache();
		const manifest = createProject(join(TEST_PROJECTS_BASE, 'test-project'), 'Test Project', '');
		projectId = manifest.id;
	});

	afterAll(() => {
		try {
			rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
			rmSync(TEST_PROJECTS_BASE, { recursive: true, force: true });
		} catch {
			// ignore cleanup
		}
	});

	it('GET /api/plugins/catalog returns plugin list', async () => {
		const { GET } = await import('../plugins/catalog/+server');
		const response = await GET(makeEvent('http://localhost/api/plugins/catalog'));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(Array.isArray(body.plugins)).toBe(true);
		expect(body.plugins.some((plugin: { id: string }) => plugin.id === 'agri-ndvi-mission')).toBe(
			true
		);
	});
});
