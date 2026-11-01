/**
 * Comprehensive MCS E2E test suite.
 * Tests the full user workflow: project creation, data ingestion,
 * object management, view rendering, API contract, and UI interactions.
 *
 * Playwright starts an isolated preview server and project store.
 */

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { deleteProject, takeScreenshot } from './e2e-utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function createProject(request: APIRequestContext): Promise<{ id: string; name: string }> {
	const ts = Date.now();
	const res = await request.post('/api/projects', {
		data: { name: `MCS Audit ${ts}` }
	});
	expect(res.ok(), `project creation failed: ${await res.text()}`).toBeTruthy();
	return (await res.json()) as { id: string; name: string };
}

async function getRootId(request: APIRequestContext, projectId: string): Promise<string> {
	const res = await request.get(`/api/projects/${projectId}/objects`);
	expect(res.ok()).toBeTruthy();
	const tree = (await res.json()) as { id: string };
	return tree.id;
}

async function createObject(
	request: APIRequestContext,
	projectId: string,
	parentId: string,
	type: string,
	name: string,
	props: Record<string, unknown> = {}
): Promise<string> {
	const res = await request.post(`/api/projects/${projectId}/objects`, {
		data: { type, parentId, name, props }
	});
	expect(res.ok(), `create ${type} failed: ${await res.text()}`).toBeTruthy();
	const body = (await res.json()) as { id: string };
	return body.id;
}

async function ingestSample(
	request: APIRequestContext,
	projectId: string,
	streamId: string,
	values: Record<string, number>,
	ts?: number
) {
	const res = await request.post('/api/ingest', {
		data: { projectId, streamId, timestamp: ts ?? Date.now() / 1000, values }
	});
	expect(res.ok(), `ingest failed: ${await res.text()}`).toBeTruthy();
}

async function openProject(page: Page, projectId: string) {
	await page.goto(`/project/${projectId}`);
	await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
}

// ─── Suite 1: Project lifecycle ──────────────────────────────────────────────

test.describe('Project lifecycle', () => {
	test('root shows the command-line start screen without a default project', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('no-project-screen')).toBeVisible({ timeout: 8000 });
		await expect(page.getByText('mcs create my-project')).toBeVisible();
		await expect(page.getByRole('link', { name: /project manager/i })).toHaveAttribute(
			'href',
			'/projects'
		);
	});

	test('project manager loads and lists projects', async ({ page }, testInfo) => {
		await page.goto('/projects');
		await expect(page.locator('h1, .brand, [class*="home"]').first()).toBeVisible({
			timeout: 8000
		});
		// The existing project manager remains available at its secondary route.
		await expect(page.locator('.section, .project-list, form').first()).toBeVisible({
			timeout: 5000
		});
		await takeScreenshot(page, testInfo, 'home-page.png', { fullPage: true });
	});

	test('create project from the project manager and navigate to it', async ({
		page,
		request
	}, testInfo) => {
		const ts = Date.now();
		const name = `E2E Create ${ts}`;
		await page.goto('/projects');
		// Wait for full JS hydration before interacting with the create form
		const createSection = page.locator('section').filter({ hasText: 'Create project' });
		await expect(createSection).toBeVisible({ timeout: 8000 });

		// Fill in project name
		const nameInput = createSection.locator('input[type="text"]').first();
		await nameInput.fill(name);

		// Wait for network idle to ensure page JS is fully initialised before submit
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

		// Submit via the form's Create button
		const createBtn = createSection.locator('button[type="submit"]');
		await expect(createBtn).toBeEnabled({ timeout: 5000 });
		await createBtn.click();

		// Should navigate to the new project
		await expect(page).toHaveURL(/\/project\//, { timeout: 15000 });
		await expect(page.getByRole('main')).toBeVisible();

		await takeScreenshot(page, testInfo, 'new-project.png');

		// Cleanup via API
		const listRes = await request.get('/api/projects');
		const projects = (await listRes.json()) as { id: string; name: string }[];
		const proj = projects.find((p) => p.name === name);
		if (proj) await deleteProject(request, proj.id);
	});

	test('project API: create, read, patch, then delete', async ({ request }) => {
		// Create
		const ts = Date.now();
		const createRes = await request.post('/api/projects', {
			data: { name: `API Test ${ts}`, notes: 'API test project' }
		});
		expect(createRes.ok()).toBeTruthy();
		const proj = (await createRes.json()) as { id: string; name: string; notes: string };
		expect(proj.id).toBeTruthy();
		expect(proj.name).toBe(`API Test ${ts}`);

		// Read
		const getRes = await request.get(`/api/projects/${proj.id}`);
		expect(getRes.ok()).toBeTruthy();
		const fetched = (await getRes.json()) as { id: string; name: string };
		expect(fetched.id).toBe(proj.id);

		// Patch name
		const patchRes = await request.patch(`/api/projects/${proj.id}`, {
			data: { name: 'Renamed Project', settings: { dateTime: { timeFormat: '12h' } } }
		});
		expect(patchRes.ok()).toBeTruthy();

		// Verify patch applied
		const afterPatch = await request.get(`/api/projects/${proj.id}`);
		const updatedProj = (await afterPatch.json()) as {
			name: string;
			settings?: { dateTime?: { timeFormat?: string } };
		};
		expect(updatedProj.name).toBe('Renamed Project');
		expect(updatedProj.settings?.dateTime?.timeFormat).toBe('12h');

		// Delete (metadata only)
		const deleteRes = await request.delete(`/api/projects/${proj.id}`);
		expect(deleteRes.status()).toBe(204);
	});
});

// ─── Suite 2: Object tree CRUD ───────────────────────────────────────────────

test.describe('Object tree CRUD', () => {
	let projectId: string;
	let rootId: string;

	test.beforeAll(async ({ request }) => {
		const proj = await createProject(request);
		projectId = proj.id;
		rootId = await getRootId(request, projectId);
	});

	test.afterAll(async ({ request }) => {
		if (projectId) await deleteProject(request, projectId);
	});

	test('create and read a folder', async ({ request }) => {
		const res = await request.post(`/api/projects/${projectId}/objects`, {
			data: { type: 'folder', parentId: rootId, name: 'Test Folder' }
		});
		expect(res.ok()).toBeTruthy();
		const folder = (await res.json()) as { id: string; type: string; name: string };
		expect(folder.type).toBe('folder');
		expect(folder.name).toBe('Test Folder');

		// Fetch single object
		const getRes = await request.get(`/api/projects/${projectId}/objects/${folder.id}`);
		expect(getRes.ok()).toBeTruthy();
		const fetched = (await getRes.json()) as { id: string; name: string; parentId: string };
		expect(fetched.parentId).toBe(rootId);
	});

	test('create the line plot', async ({ request }) => {
		const types = ['line-plot'];
		for (const type of types) {
			const res = await request.post(`/api/projects/${projectId}/objects`, {
				data: { type, parentId: rootId, name: `${type} test` }
			});
			expect(res.ok(), `failed to create ${type}: ${await res.text()}`).toBeTruthy();
			const obj = (await res.json()) as { id: string; type: string };
			expect(obj.type).toBe(type);
		}
	});

	test('create display types', async ({ request }) => {
		const types = ['gauge', 'telemetry-table', 'markdown-note', 'image', 'video-stream'];
		for (const type of types) {
			const res = await request.post(`/api/projects/${projectId}/objects`, {
				data: { type, parentId: rootId, name: `${type} test` }
			});
			expect(res.ok(), `failed to create ${type}`).toBeTruthy();
		}
	});

	test('create layout types', async ({ request }) => {
		for (const type of ['flex-layout', 'grid-layout']) {
			const res = await request.post(`/api/projects/${projectId}/objects`, {
				data: { type, parentId: rootId, name: `${type} test` }
			});
			expect(res.ok(), `failed to create ${type}`).toBeTruthy();
		}
	});

	test('patch object name and props', async ({ request }) => {
		const id = await createObject(request, projectId, rootId, 'gauge', 'Patch Test Gauge');
		const patchRes = await request.patch(`/api/projects/${projectId}/objects/${id}`, {
			data: { name: 'Renamed Gauge', props: { min: 0, max: 200, unit: 'km/h' } }
		});
		expect(patchRes.ok()).toBeTruthy();

		const getRes = await request.get(`/api/projects/${projectId}/objects/${id}`);
		const updated = (await getRes.json()) as { name: string; props: Record<string, unknown> };
		expect(updated.name).toBe('Renamed Gauge');
		expect((updated.props as { unit: string }).unit).toBe('km/h');
	});

	test('delete object', async ({ request }) => {
		const id = await createObject(request, projectId, rootId, 'folder', 'Delete Me');
		const deleteRes = await request.delete(`/api/projects/${projectId}/objects/${id}`);
		expect(deleteRes.ok()).toBeTruthy();

		const getRes = await request.get(`/api/projects/${projectId}/objects/${id}`);
		expect(getRes.status()).toBe(404);
	});

	test('create child rejects non-container parent', async ({ request }) => {
		const gaugeId = await createObject(request, projectId, rootId, 'gauge', 'Parent Gauge');
		const res = await request.post(`/api/projects/${projectId}/objects`, {
			data: { type: 'folder', parentId: gaugeId, name: 'Inside Gauge' }
		});
		expect(res.status()).toBe(400);
	});

	test('optimistic concurrency: PATCH with wrong expectedUpdatedAt returns 409', async ({
		request
	}) => {
		const id = await createObject(request, projectId, rootId, 'folder', 'Concurrency Test');
		const fakeTs = '2000-01-01T00:00:00.000Z';
		const res = await request.patch(`/api/projects/${projectId}/objects/${id}`, {
			data: { name: 'No conflict', expectedUpdatedAt: fakeTs }
		});
		expect(res.status()).toBe(409);
		const body = (await res.json()) as { error?: string; name?: string };
		// 409 should return the current object
		expect(body.name).toBeDefined();
	});
});

// ─── Suite 3: Ingest & Stream API ────────────────────────────────────────────

test.describe('Ingest and streams', () => {
	let projectId: string;

	test.beforeAll(async ({ request }) => {
		const proj = await createProject(request);
		projectId = proj.id;
	});

	test.afterAll(async ({ request }) => {
		if (projectId) await deleteProject(request, projectId);
	});

	test('single ingest creates a stream and returns sample', async ({ request }) => {
		const ts = Date.now() / 1000 - 60;
		await ingestSample(request, projectId, 'test.temperature', { value: 23.5 }, ts);

		const res = await request.get(`/api/projects/${projectId}/streams/test.temperature`);
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { lastValue?: number };
		expect(typeof body.lastValue).toBe('number');
	});

	test('batch ingest returns correct count', async ({ request }) => {
		const now = Date.now() / 1000;
		const res = await request.post('/api/ingest/batch', {
			data: {
				projectId,
				samples: [
					{ streamId: 'batch.pressure', timestamp: now - 10, values: { value: 1013 } },
					{ streamId: 'batch.humidity', timestamp: now - 5, values: { value: 55 } },
					{ streamId: 'batch.temperature', timestamp: now, values: { value: 22 } }
				]
			}
		});
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { ok: boolean; count: number };
		expect(body.ok).toBe(true);
		expect(body.count).toBe(3);
	});

	test('samples endpoint returns range data', async ({ request }) => {
		const now = Date.now() / 1000;
		// Ingest 5 samples
		for (let i = 0; i < 5; i++) {
			await ingestSample(request, projectId, 'range.test', { value: i * 10 }, now - 50 + i * 10);
		}

		const from = now - 55;
		const to = now + 5;
		const res = await request.get(
			`/api/projects/${projectId}/streams/range.test/samples?from=${from}&to=${to}`
		);
		expect(res.ok()).toBeTruthy();
		const body = (await res.json()) as { data: unknown[] };
		expect(body.data.length).toBeGreaterThanOrEqual(5);
	});

	test('stream list shows ingested streams', async ({ request }) => {
		const res = await request.get(`/api/projects/${projectId}/streams`);
		expect(res.ok()).toBeTruthy();
		const streams = (await res.json()) as { id: string }[];
		const ids = streams.map((s) => s.id);
		expect(ids).toContain('test.temperature');
		expect(ids).toContain('batch.pressure');
	});

	test('stream declare updates metadata', async ({ request }) => {
		const res = await request.post(`/api/projects/${projectId}/streams/declare`, {
			data: {
				streams: [
					{
						id: 'declared.stream',
						name: 'Declared Stream',
						metadata: { unit: 'V', description: 'Voltage' }
					}
				]
			}
		});
		expect(res.ok()).toBeTruthy();
	});

	test('ingest with missing projectId returns 400', async ({ request }) => {
		const res = await request.post('/api/ingest', {
			data: { streamId: 'test', values: { v: 1 } }
		});
		expect(res.status()).toBe(400);
	});

	test('ingest with unknown projectId returns 404', async ({ request }) => {
		const res = await request.post('/api/ingest', {
			data: {
				projectId: '00000000-0000-0000-0000-000000000000',
				streamId: 'test',
				values: { v: 1 }
			}
		});
		expect(res.status()).toBe(404);
	});
});

// ─── Suite 4: Annotations ────────────────────────────────────────────────────

test.describe('Annotations', () => {
	let projectId: string;

	test.beforeAll(async ({ request }) => {
		const proj = await createProject(request);
		projectId = proj.id;
	});

	test.afterAll(async ({ request }) => {
		if (projectId) await deleteProject(request, projectId);
	});

	test('create, list, and delete an annotation', async ({ request }) => {
		const ts = Date.now() / 1000;

		// Create
		const createRes = await request.post(`/api/projects/${projectId}/annotations`, {
			data: { ts, label: 'Ignition', details: 'Motor ignition at T+0' }
		});
		expect(createRes.ok()).toBeTruthy();
		const created = (await createRes.json()) as { id: string };
		expect(created.id).toBeTruthy();

		// List
		const listRes = await request.get(
			`/api/projects/${projectId}/annotations?from=${ts - 10}&to=${ts + 10}`
		);
		expect(listRes.ok()).toBeTruthy();
		const annotations = (await listRes.json()) as { id: string; label: string }[];
		expect(annotations.some((a) => a.id === created.id && a.label === 'Ignition')).toBeTruthy();

		// Delete
		const deleteRes = await request.delete(`/api/projects/${projectId}/annotations/${created.id}`);
		expect(deleteRes.status()).toBe(204);

		// Verify deleted
		const afterDelete = await request.get(
			`/api/projects/${projectId}/annotations?from=${ts - 10}&to=${ts + 10}`
		);
		const afterList = (await afterDelete.json()) as { id: string }[];
		expect(afterList.some((a) => a.id === created.id)).toBeFalsy();
	});

	test('delete non-existent annotation returns 404', async ({ request }) => {
		const res = await request.delete(
			`/api/projects/${projectId}/annotations/00000000-0000-0000-0000-000000000000`
		);
		expect(res.status()).toBe(404);
	});
});

// ─── Suite 7: Full UI workflow ────────────────────────────────────────────────

test.describe('Full UI workflow', () => {
	let projectId: string;
	let rootId: string;

	test.beforeAll(async ({ request }) => {
		const proj = await createProject(request);
		projectId = proj.id;
		rootId = await getRootId(request, projectId);
		// Pre-seed with ingest data
		const now = Date.now() / 1000;
		for (let i = 0; i < 20; i++) {
			await ingestSample(
				request,
				projectId,
				'ui.sensor',
				{ value: Math.sin(i / 3) * 50 + 50 },
				now - 20 + i
			);
		}
	});

	test.afterAll(async ({ request }) => {
		if (projectId) await deleteProject(request, projectId);
	});

	test('project page loads and shows tree', async ({ page }, testInfo) => {
		await openProject(page, projectId);
		// Tree should show the project root
		const treeNode = page.locator('.tree-node').first();
		await expect(treeNode).toBeVisible({ timeout: 8000 });
		await takeScreenshot(page, testInfo, 'project-loaded.png');
	});

	test('command palette opens with keyboard shortcut', async ({ page }, testInfo) => {
		await openProject(page, projectId);
		await page.keyboard.press('ControlOrMeta+k');
		await expect(page.locator('.command-palette, [class*="palette"]').first()).toBeVisible({
			timeout: 3000
		});
		await page.keyboard.press('Escape');
		await takeScreenshot(page, testInfo, 'command-palette.png');
	});

	test('create line plot in UI, select it, verify properties panel', async ({
		page,
		request
	}, testInfo) => {
		const linePlotId = await createObject(request, projectId, rootId, 'line-plot', 'UI Line Plot', {
			dataSources: [{ streamId: 'ui.sensor', field: 'value', label: 'Sensor' }],
			showGrid: true
		});

		await openProject(page, projectId);
		// Find and click the line plot tree node
		const node = page.locator('.tree-node').filter({ hasText: 'UI Line Plot' }).first();
		await expect(node).toBeVisible({ timeout: 8000 });
		await node.click();

		// Properties panel (right sidebar) should appear
		await expect(page.locator('.sidebar-right').first()).toBeVisible({ timeout: 5000 });
		// Panel should show the object name (panel-header visible when selected)
		await expect(page.locator('.panel-header, .panel-empty').first()).toBeVisible({
			timeout: 5000
		});
		await takeScreenshot(page, testInfo, 'line-plot-selected.png');
	});

	test('create gauge in UI, configure data source, see live value', async ({
		page,
		request
	}, testInfo) => {
		const gaugeId = await createObject(request, projectId, rootId, 'gauge', 'UI Gauge', {
			min: 0,
			max: 100,
			dataSource: 'ui.sensor',
			displayType: 'linear'
		});

		await openProject(page, projectId);
		const node = page.locator('.tree-node').filter({ hasText: 'UI Gauge' }).first();
		await expect(node).toBeVisible({ timeout: 8000 });
		await node.click();

		// Center view should show the gauge
		await expect(page.locator('.gauge-view, [class*="gauge"]').first()).toBeVisible({
			timeout: 8000
		});
		await takeScreenshot(page, testInfo, 'gauge-view.png');
	});

	test('settings modal opens and shows tabs', async ({ page }, testInfo) => {
		await openProject(page, projectId);

		// Find settings button in header
		const settingsBtn = page
			.locator('[aria-label*="Settings"], [title*="Settings"], button:has([data-settings])')
			.first();
		if ((await settingsBtn.count()) > 0) {
			await settingsBtn.click();
			await expect(page.locator('[role="dialog"], .modal').first()).toBeVisible({ timeout: 5000 });
			await takeScreenshot(page, testInfo, 'settings-modal.png');
		}
	});

	test('sidebar can be toggled', async ({ page }, testInfo) => {
		await openProject(page, projectId);
		await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

		// Look for any sidebar toggle button
		const sidebar = page.locator('.sidebar-left, .sidebar-right, [class*="sidebar"]').first();
		const initialVisible = await sidebar.isVisible();

		// There should be buttons for collapsing sidebars
		const toggleBtn = page
			.locator('.sidebar-toggle, [class*="collapse"], [aria-label*="sidebar"]')
			.first();
		if ((await toggleBtn.count()) > 0) {
			await toggleBtn.click();
			await page.waitForTimeout(300);
			await takeScreenshot(page, testInfo, 'sidebar-toggled.png');
		}
	});

	test('time conductor shows realtime controls', async ({ page }, testInfo) => {
		await openProject(page, projectId);
		const timeConductor = page.locator('.time-conductor, [class*="conductor"]').first();
		await expect(timeConductor).toBeVisible({ timeout: 8000 });
		// Realtime button should be present
		await expect(page.getByRole('button', { name: /realtime/i }).first()).toBeVisible();
		await takeScreenshot(page, testInfo, 'time-conductor.png');
	});
});

// ─── Suite 9: Service worker and HEAD requests ────────────────────────────────

test.describe('Service worker endpoint', () => {
	test('GET /sw.js returns empty service worker', async ({ request }) => {
		const res = await request.get('/sw.js');
		expect(res.ok()).toBeTruthy();
		const body = await res.text();
		expect(body).toContain('No service worker');
	});

	test('HEAD /sw.js returns 200 with correct content-type', async ({ request }) => {
		const res = await request.head('/sw.js');
		expect(res.ok()).toBeTruthy();
		const ct = res.headers()['content-type'];
		expect(ct).toContain('javascript');
	});

	test('GET /api/health reports a live process without caching', async ({ request }) => {
		const response = await request.get('/api/health');
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe('no-store');
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
	});
});

// ─── Suite 10: Object reorder API ────────────────────────────────────────────

test.describe('Object reorder', () => {
	let projectId: string;
	let rootId: string;

	test.beforeAll(async ({ request }) => {
		const proj = await createProject(request);
		projectId = proj.id;
		rootId = await getRootId(request, projectId);
	});

	test.afterAll(async ({ request }) => {
		if (projectId) await deleteProject(request, projectId);
	});

	test('reorder children successfully', async ({ request }) => {
		const a = await createObject(request, projectId, rootId, 'folder', 'Folder A');
		const b = await createObject(request, projectId, rootId, 'folder', 'Folder B');
		const c = await createObject(request, projectId, rootId, 'folder', 'Folder C');

		// Reorder to C, A, B
		const res = await request.post(`/api/projects/${projectId}/object-reorder`, {
			data: { parentId: rootId, childIds: [c, a, b] }
		});
		expect(res.ok(), `reorder failed: ${await res.text()}`).toBeTruthy();

		// Verify order in tree
		const treeRes = await request.get(`/api/projects/${projectId}/objects`);
		const tree = (await treeRes.json()) as { children: { id: string; name: string }[] };
		const names = tree.children.map((c) => c.name);
		const cIdx = names.indexOf('Folder C');
		const aIdx = names.indexOf('Folder A');
		const bIdx = names.indexOf('Folder B');
		expect(cIdx).toBeLessThan(aIdx);
		expect(aIdx).toBeLessThan(bIdx);
	});

	test('reorder with wrong childIds returns 400', async ({ request }) => {
		const res = await request.post(`/api/projects/${projectId}/object-reorder`, {
			data: { parentId: rootId, childIds: ['nonexistent-uuid'] }
		});
		expect(res.status()).toBe(400);
	});
});
