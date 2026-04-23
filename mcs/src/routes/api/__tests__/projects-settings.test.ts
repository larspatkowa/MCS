import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clearConfigCache } from '$lib/server/config';
import { createProject } from '$lib/server/project';

const TEST_CONFIG_DIR = join(tmpdir(), `mcs-settings-test-config-${Date.now()}`);
const TEST_PROJECTS_BASE = join(tmpdir(), `mcs-settings-test-projects-${Date.now()}`);

function makeEvent(
	url: string,
	method = 'GET',
	body?: unknown,
	params: Record<string, string> = {}
) {
	return {
		params,
		getClientAddress: () => '',
		cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
		fetch: globalThis.fetch,
		isDataRequest: false,
		isSubRequest: false,
		locals: {},
		platform: undefined,
		request: new Request(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		}),
		route: { id: '' },
		setHeaders: () => {},
		url: new URL(url)
	} as any;
}

describe('API /api/projects/[id] settings persistence', () => {
	let projectId = '';

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = TEST_CONFIG_DIR;
		clearConfigCache();
		const manifest = createProject(
			join(TEST_PROJECTS_BASE, 'settings-project'),
			'Settings Project',
			''
		);
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

	it('PATCH persists autoStartPlugins alongside dateTime settings', async () => {
		const { GET, PATCH } = await import('../projects/[id]/+server');

		const patchResponse = await PATCH(
			makeEvent(
				`http://localhost/api/projects/${projectId}`,
				'PATCH',
				{
					settings: {
						autoStartPlugins: ['agri-ndvi-mission'],
						dateTime: { dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm:ss' }
					}
				},
				{ id: projectId }
			)
		);

		expect(patchResponse.status).toBe(200);
		const patched = await patchResponse.json();
		expect(patched.settings.autoStartPlugins).toEqual(['agri-ndvi-mission']);
		expect(patched.settings.dateTime).toEqual({
			dateFormat: 'YYYY-MM-DD',
			timeFormat: 'HH:mm:ss'
		});

		const getResponse = await GET(
			makeEvent(`http://localhost/api/projects/${projectId}`, 'GET', undefined, { id: projectId })
		);
		expect(getResponse.status).toBe(200);
		const project = await getResponse.json();
		expect(project.settings.autoStartPlugins).toEqual(['agri-ndvi-mission']);
		expect(project.settings.dateTime).toEqual({
			dateFormat: 'YYYY-MM-DD',
			timeFormat: 'HH:mm:ss'
		});
	});
});
