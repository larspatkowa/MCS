import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache } from '$lib/server/config';
import { createProject } from '$lib/server/project';

// Use isolated config and project dir so we don't touch real data.
const TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'mcs-api-test-config-'));
const TEST_PROJECTS_BASE = mkdtempSync(join(tmpdir(), 'mcs-api-test-projects-'));

describe('API /api/projects/[id]/objects', () => {
	let projectId: string;
	let projectPath: string;

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = TEST_CONFIG_DIR;
		clearConfigCache();
		const manifest = createProject(join(TEST_PROJECTS_BASE, 'test-project'), 'Test Project', '');
		projectId = manifest.id;
		projectPath = join(TEST_PROJECTS_BASE, 'test-project');
	});

	afterAll(() => {
		try {
			rmSync(TEST_CONFIG_DIR, { recursive: true });
			rmSync(TEST_PROJECTS_BASE, { recursive: true });
		} catch {
			// ignore
		}
	});

	it('GET returns object tree with root', async () => {
		const { GET } = await import('../projects/[id]/objects/+server');
		const response = await GET({
			params: { id: projectId },
			getClientAddress: () => '',
			cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
			fetch: globalThis.fetch,
			isDataRequest: false,
			isSubRequest: false,
			locals: {},
			platform: undefined,
			request: new Request('http://localhost/api/projects/' + projectId + '/objects'),
			route: { id: '' },
			setHeaders: () => {},
			url: new URL('http://localhost/api/projects/' + projectId + '/objects')
		} as any);
		expect(response.status).toBe(200);
		const tree = await response.json();
		expect(tree).toBeDefined();
		expect(tree.type).toBe('project');
		expect(tree.id).toBe(projectId);
		expect(Array.isArray(tree.children)).toBe(true);
	});

	it('POST creates object and returns it', async () => {
		const { GET, POST } = await import('../projects/[id]/objects/+server');
		const createRes = await POST({
			params: { id: projectId },
			getClientAddress: () => '',
			cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
			fetch: globalThis.fetch,
			isDataRequest: false,
			isSubRequest: false,
			locals: {},
			platform: undefined,
			request: new Request('http://localhost/api/projects/' + projectId + '/objects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'folder',
					parentId: projectId,
					name: 'Child Folder'
				})
			}),
			route: { id: '' },
			setHeaders: () => {},
			url: new URL('http://localhost/api/projects/' + projectId + '/objects')
		} as any);
		expect(createRes.status).toBe(200);
		const created = await createRes.json();
		expect(created.type).toBe('folder');
		expect(created.name).toBe('Child Folder');
		expect(created.id).toBeDefined();

		const getRes = await GET({
			params: { id: projectId },
			getClientAddress: () => '',
			cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
			fetch: globalThis.fetch,
			isDataRequest: false,
			isSubRequest: false,
			locals: {},
			platform: undefined,
			request: new Request('http://localhost/api/projects/' + projectId + '/objects'),
			route: { id: '' },
			setHeaders: () => {},
			url: new URL('http://localhost/api/projects/' + projectId + '/objects')
		} as any);
		const tree = await getRes.json();
		expect(tree.children.some((c: { id: string }) => c.id === created.id)).toBe(true);
	});

	it('GET returns 404 for unknown project id', async () => {
		const { GET } = await import('../projects/[id]/objects/+server');
		const response = await GET({
			params: { id: '00000000-0000-0000-0000-000000000000' },
			getClientAddress: () => '',
			cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
			fetch: globalThis.fetch,
			isDataRequest: false,
			isSubRequest: false,
			locals: {},
			platform: undefined,
			request: new Request(
				'http://localhost/api/projects/00000000-0000-0000-0000-000000000000/objects'
			),
			route: { id: '' },
			setHeaders: () => {},
			url: new URL('http://localhost/api/projects/00000000-0000-0000-0000-000000000000/objects')
		} as any);
		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe('Project not found');
	});
});
