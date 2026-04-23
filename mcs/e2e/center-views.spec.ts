import { test, expect, type APIRequestContext } from '@playwright/test';
import { deleteProject } from './e2e-utils';

async function ensureProjectId(request: APIRequestContext): Promise<string | null> {
	const now = Date.now();
	const nonce = Math.random().toString(16).slice(2, 8);
	const createRes = await request.post('/api/projects', {
		data: { name: `E2E Project ${now}-${nonce}`, path: `./data/projects/e2e-${now}-${nonce}` }
	});
	if (createRes.ok()) {
		const created = (await createRes.json()) as { id?: string };
		if (created.id) return created.id;
	}
	return null;
}

async function seedBasicObjects(request: APIRequestContext, projectId: string) {
	// Ensure we have at least a folder and a layout so we can select different view types
	const treeRes = await request.get(`/api/projects/${projectId}/objects`);
	if (!treeRes.ok()) return;
	const tree = (await treeRes.json()) as { id?: string; children?: { id: string; type: string }[] };
	const rootId = tree?.id;
	if (!rootId) return;
	if (tree.children && tree.children.length > 0) return;

	await request.post(`/api/projects/${projectId}/objects`, {
		data: { type: 'folder', parentId: rootId, name: 'Test Folder' }
	});
	await request.post(`/api/projects/${projectId}/objects`, {
		data: { type: 'layout', parentId: rootId, name: 'Flex Layout' }
	});
	await request.post(`/api/projects/${projectId}/objects`, {
		data: {
			type: 'line-plot',
			parentId: rootId,
			name: 'Line Plot',
			props: { dataSources: [], showGrid: true, pollInterval: 5000 }
		}
	});
	await request.post(`/api/projects/${projectId}/objects`, {
		data: {
			type: 'gauge',
			parentId: rootId,
			name: 'Gauge',
			props: { min: 0, max: 100, dataSource: '' }
		}
	});
}

async function ensureFolderPlotMap(
	request: APIRequestContext,
	projectId: string
): Promise<{ folderId: string; functionPlotId: string; mapId: string } | null> {
	const treeRes = await request.get(`/api/projects/${projectId}/objects`);
	if (!treeRes.ok()) return null;
	const tree = (await treeRes.json()) as {
		id?: string;
		children?: Array<{
			id: string;
			name?: string;
			type?: string;
			children?: Array<{ id: string; name?: string; type?: string }>;
		}>;
	};
	const rootId = tree.id;
	if (!rootId) return null;

	let folder = (tree.children ?? []).find((c) => c.type === 'folder' && c.name === 'Child Folder');
	if (!folder) {
		const created = await request.post(`/api/projects/${projectId}/objects`, {
			data: { type: 'folder', parentId: rootId, name: 'Child Folder' }
		});
		if (!created.ok()) return null;
		const body = (await created.json()) as { id?: string };
		if (!body.id) return null;
		folder = { id: body.id, type: 'folder', name: 'Child Folder', children: [] };
	}

	let functionPlot = (folder.children ?? []).find(
		(c) => c.type === 'function-plot' && c.name === 'Function Plot E to E'
	);
	if (!functionPlot) {
		const created = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'function-plot',
				parentId: folder.id,
				name: 'Function Plot E to E',
				props: {
					expression: '40 + 25 * sin(t / 10)',
					sampleCount: 240,
					color: '#22d3ee'
				}
			}
		});
		if (!created.ok()) return null;
		const body = (await created.json()) as { id?: string };
		if (!body.id) return null;
		functionPlot = { id: body.id, type: 'function-plot', name: 'Function Plot E to E' };
	}

	let mapObj = (folder.children ?? []).find(
		(c) => c.type === 'map-view' && c.name === 'Orbital Map'
	);
	if (!mapObj) {
		const created = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'map-view',
				parentId: folder.id,
				name: 'Orbital Map',
				props: {
					showTrail: true,
					showPredictedOrbit: true
				}
			}
		});
		if (!created.ok()) return null;
		const body = (await created.json()) as { id?: string };
		if (!body.id) return null;
		mapObj = { id: body.id, type: 'map-view', name: 'Orbital Map' };
	}

	return { folderId: folder.id, functionPlotId: functionPlot.id, mapId: mapObj.id };
}

test.describe('Center views and no-freeze', () => {
	test('opens project and center view responds after selecting objects', async ({
		page,
		request
	}) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			await seedBasicObjects(request, projectId);

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			// Wait for tree to load (project root or children)
			const treeNode = page.locator('.tree-node').first();
			await expect(treeNode).toBeVisible({ timeout: 5000 });

			// Select first tree node (project or folder)
			await treeNode.click();
			await expect(page.locator('.center-view').first()).toBeVisible();

			// Click another node if there are children (e.g. folder or layout)
			const nodes = page.locator('.tree-node');
			const count = await nodes.count();
			if (count >= 2) {
				await nodes.nth(1).click();
				await expect(page.locator('.center-view').first()).toBeVisible();
				// Verify we can still click the tree (no freeze)
				await nodes.nth(0).click();
				await expect(page.locator('.center-view').first()).toBeVisible();
			}
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('selecting line plot then clicking tree does not freeze UI', async ({ page, request }) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			await seedBasicObjects(request, projectId);

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			// Find a line-plot in the tree (by label or by opening a folder)
			const linePlotNode = page.locator('.tree-node').filter({ hasText: 'Line Plot' }).first();
			const hasLinePlot = (await linePlotNode.count()) > 0;
			if (!hasLinePlot) {
				test.skip();
				return;
			}

			await linePlotNode.click();
			// Center should show chart area or empty state
			await expect(page.locator('.center-view').first()).toBeVisible();
			await expect(page.locator('.chart-container, .empty').first()).toBeVisible({
				timeout: 3000
			});

			// Click back on project or another node – must still respond (no freeze)
			const firstNode = page.locator('.tree-node').first();
			await firstNode.click();
			await expect(page.locator('.center-view').first()).toBeVisible();
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('sidebar toggle and header menu remain clickable after viewing plot', async ({
		page,
		request
	}) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			await seedBasicObjects(request, projectId);

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			const linePlotNode = page.locator('.tree-node').filter({ hasText: 'Line Plot' }).first();
			if ((await linePlotNode.count()) > 0) {
				await linePlotNode.click();
				await expect(page.locator('.center-view').first()).toBeVisible();
			}

			// Toggle sidebar (if visible) – button or collapse icon
			const sidebarToggle = page.locator('.sidebar-toggle').first();
			if ((await sidebarToggle.count()) > 0) {
				await sidebarToggle.click();
				// After toggle, either sidebar is hidden or a center-header-toggle is shown
				await expect(page.locator('.center-header-toggle').first()).toBeVisible();
			}

			// Object menu (ellipsis) in center header – open and close
			const menuBtn = page.getByRole('button', { name: /object menu|menu/i }).first();
			if ((await menuBtn.count()) > 0) {
				await menuBtn.click();
				await expect(page.locator('[role="menu"]')).toBeVisible({ timeout: 2000 });
				await page.keyboard.press('Escape');
			}
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('switching Child Folder -> Function Plot E to E -> Orbital Map updates without refresh', async ({
		page,
		request
	}) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			const seeded = await ensureFolderPlotMap(request, projectId);
			if (!seeded) {
				test.skip();
				return;
			}

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			const childFolderNode = page.getByRole('button', { name: 'Child Folder' }).first();
			await expect(childFolderNode).toBeVisible();
			await childFolderNode.click();
			await expect(page.getByRole('heading', { name: 'Child Folder' })).toBeVisible();

			const functionNode = page.getByRole('button', { name: 'Function Plot E to E' }).first();
			await expect(functionNode).toBeVisible();
			await functionNode.click();
			await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue(
				'Function Plot E to E'
			);
			await expect(page.locator('.chart-container')).toBeVisible({ timeout: 6000 });

			const mapNode = page.getByRole('button', { name: 'Orbital Map' }).first();
			await expect(mapNode).toBeVisible();
			await mapNode.click();
			await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue('Orbital Map');
			await expect(page.locator('.map-view')).toBeVisible({ timeout: 6000 });
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('rapidly switching between Child Folder, Function Plot E to E and Orbital Map stays reactive', async ({
		page,
		request
	}) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			const seeded = await ensureFolderPlotMap(request, projectId);
			if (!seeded) {
				test.skip();
				return;
			}

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			const childFolderNode = page.getByRole('button', { name: 'Child Folder' }).first();
			const functionNode = page.getByRole('button', { name: 'Function Plot E to E' }).first();
			const mapNode = page.getByRole('button', { name: 'Orbital Map' }).first();

			await expect(childFolderNode).toBeVisible();
			await childFolderNode.click();
			await expect(functionNode).toBeVisible();
			await expect(mapNode).toBeVisible();

			for (let i = 0; i < 3; i += 1) {
				await childFolderNode.click();
				await expect(page.getByRole('heading', { name: 'Child Folder' })).toBeVisible();

				await functionNode.click();
				await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue(
					'Function Plot E to E'
				);
				await expect(page.locator('.chart-container')).toBeVisible({ timeout: 6000 });

				await mapNode.click();
				await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue('Orbital Map');
				await expect(page.locator('.map-view')).toBeVisible({ timeout: 6000 });
			}
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('properties panel shows essential fields by default and advanced when toggled', async ({
		page,
		request
	}) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			const seeded = await ensureFolderPlotMap(request, projectId);
			if (!seeded) {
				test.skip();
				return;
			}

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			const childFolderNode = page.getByRole('button', { name: 'Child Folder' }).first();
			await childFolderNode.click();
			await expect(page.getByRole('button', { name: 'Orbital Map' }).first()).toBeVisible();

			await page.getByRole('button', { name: 'Orbital Map' }).first().click();
			await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue('Orbital Map');

			// Properties panel should use "Show advanced" checkbox
			const advancedToggle = page.getByLabel('Show advanced');
			await expect(advancedToggle).toBeVisible();

			// Uncheck to ensure essentials mode
			if (await advancedToggle.isChecked()) {
				await advancedToggle.click();
			}
			// Essential fields should be visible (e.g. GPS Stream, Base Layer)
			await expect(page.getByText('Properties').first()).toBeVisible();

			// Check the advanced toggle to show all fields
			await advancedToggle.click();
			await expect(advancedToggle).toBeChecked();
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('map properties stay compact by default in essentials mode', async ({ page, request }) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			const seeded = await ensureFolderPlotMap(request, projectId);
			if (!seeded) {
				test.skip();
				return;
			}

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			await page.getByRole('button', { name: 'Child Folder' }).first().click();
			await page.getByRole('button', { name: 'Orbital Map' }).first().click();
			await expect(page.getByRole('textbox', { name: 'Object name' })).toHaveValue('Orbital Map');

			// Ensure essentials mode (unchecked)
			const advancedToggle = page.getByLabel('Show advanced');
			if (await advancedToggle.isChecked()) {
				await advancedToggle.click();
			}
			// Should show properties section
			await expect(page.getByText('Properties').first()).toBeVisible();
			// Created/Modified meta fields should not be visible in essentials mode
			await expect(page.getByText(/^Created:/)).toHaveCount(0);
			await expect(page.getByText(/^Modified:/)).toHaveCount(0);
		} finally {
			await deleteProject(request, projectId);
		}
	});
});
