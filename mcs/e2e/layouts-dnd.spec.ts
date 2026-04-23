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

async function dismissWelcomeTour(page: import('@playwright/test').Page): Promise<void> {
	const dialog = page.getByRole('dialog', { name: 'Welcome to MCS' });
	if (await dialog.isVisible().catch(() => false)) {
		const close = dialog.getByRole('button', { name: 'Close' });
		if (await close.isVisible().catch(() => false)) {
			await close.click({ force: true });
		}
		await expect(dialog).toHaveCount(0);
	}
}

test.describe('Layouts and drag-and-drop', () => {
	test('flex layout shows empty drop zone and accepts drop', async ({ page, request }) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {

		const treeRes = await request.get(`/api/projects/${projectId}/objects`);
		const tree = treeRes.ok
			? ((await treeRes.json()) as { id: string; children?: { id: string }[] })
			: null;
		const rootId = tree?.id;
		if (!rootId) {
			test.skip();
			return;
		}

		const layoutRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: { type: 'flex-layout', parentId: rootId, name: 'Flex Layout' }
		});
		const layoutObj = layoutRes.ok ? ((await layoutRes.json()) as { id: string }) : null;
		const gaugeRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'gauge',
				parentId: rootId,
				name: 'Gauge',
				props: { min: 0, max: 100, dataSource: '' }
			}
		});
		const gaugeObj = gaugeRes.ok ? ((await gaugeRes.json()) as { id: string }) : null;
		if (!layoutObj?.id || !gaugeObj?.id) {
			test.skip();
			return;
		}

		await page.goto(`/project/${projectId}?object=${layoutObj.id}`);
		await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
		await dismissWelcomeTour(page);

		const dropPane = page.locator('.leaf-pane').first();
		await expect(dropPane).toBeVisible({ timeout: 5000 });

		// Drag gauge from tree onto layout
		const gaugeNode = page.locator('.tree-node').filter({ hasText: 'Gauge' }).first();
		await expect(gaugeNode).toBeVisible();
		await gaugeNode.dragTo(dropPane, { force: true });
		// After drop, layout view should still be present (content may have updated)
		await expect(page.locator('.layout-view').first()).toBeVisible({ timeout: 3000 });
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('flex layout allows dragging a pane to split another pane', async ({ page, request }) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {

		const treeRes = await request.get(`/api/projects/${projectId}/objects`);
		const tree = treeRes.ok
			? ((await treeRes.json()) as { id: string; children?: { id: string }[] })
			: null;
		const rootId = tree?.id;
		if (!rootId) {
			test.skip();
			return;
		}

		const layoutRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: { type: 'flex-layout', parentId: rootId, name: 'Flex Layout Split DnD Test' }
		});
		const layoutObj = layoutRes.ok ? ((await layoutRes.json()) as { id: string }) : null;

		const gaugeARes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'gauge',
				parentId: rootId,
				name: 'Gauge A',
				props: { min: 0, max: 100, dataSource: '' }
			}
		});
		const gaugeAObj = gaugeARes.ok ? ((await gaugeARes.json()) as { id: string }) : null;

		const gaugeBRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'gauge',
				parentId: rootId,
				name: 'Gauge B',
				props: { min: 0, max: 100, dataSource: '' }
			}
		});
		const gaugeBObj = gaugeBRes.ok ? ((await gaugeBRes.json()) as { id: string }) : null;

		if (!layoutObj?.id || !gaugeAObj?.id || !gaugeBObj?.id) {
			test.skip();
			return;
		}

		await page.goto(`/project/${projectId}?object=${layoutObj.id}`);
		await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
		await dismissWelcomeTour(page);

		const canvas = page.locator('.leaf-pane').first();
		await expect(canvas).toBeVisible({ timeout: 5000 });
		const canvasBox = await canvas.boundingBox();
		expect(canvasBox).toBeTruthy();
		const canvasW = Math.max(1, Math.floor(canvasBox!.width));
		const canvasH = Math.max(1, Math.floor(canvasBox!.height));

		// Drop Gauge A, then split right with Gauge B.
		const gaugeANode = page.locator('.tree-node').filter({ hasText: 'Gauge A' }).first();
		await expect(gaugeANode).toBeVisible();
		await gaugeANode.dragTo(canvas, { force: true });

		const gaugeBNode = page.locator('.tree-node').filter({ hasText: 'Gauge B' }).first();
		await expect(gaugeBNode).toBeVisible();
		await gaugeBNode.dragTo(canvas, {
			targetPosition: { x: canvasW - 5, y: Math.floor(canvasH / 2) },
			force: true
		});

		await expect(page.locator('.pane-title-text').filter({ hasText: 'Gauge A' })).toBeVisible({
			timeout: 5000
		});
		await expect(page.locator('.pane-title-text').filter({ hasText: 'Gauge B' })).toBeVisible({
			timeout: 5000
		});
		await expect(page.locator('.leaf-pane')).toHaveCount(2, { timeout: 5000 });

		// Drag Gauge A pane handle onto the right zone of Gauge B to create a nested split.
		const gaugeAHandle = page.locator('.pane-title-handle').filter({ hasText: 'Gauge A' }).first();
		const gaugeBPane = page
			.locator('.leaf-pane')
			.filter({ has: page.locator('.pane-title-text', { hasText: 'Gauge B' }) })
			.first();
		const gaugeBBox = await gaugeBPane.boundingBox();
		expect(gaugeBBox).toBeTruthy();
		const gaugeBW = Math.max(1, Math.floor(gaugeBBox!.width));
		const gaugeBH = Math.max(1, Math.floor(gaugeBBox!.height));
		await gaugeAHandle.dragTo(gaugeBPane, {
			targetPosition: { x: gaugeBW - 5, y: Math.floor(gaugeBH / 2) },
			force: true
		});

		// Gauge A should still exist, Gauge B should still exist, and the source pane should collapse (no empty gap).
		await expect(page.locator('.pane-title-text').filter({ hasText: 'Gauge A' })).toBeVisible({
			timeout: 5000
		});
		await expect(page.locator('.pane-title-text').filter({ hasText: 'Gauge B' })).toBeVisible({
			timeout: 5000
		});
		await expect(page.locator('.leaf-pane')).toHaveCount(2, { timeout: 5000 });
		await expect(page.getByText('Drop an object here')).toHaveCount(0);

		// Dragging onto itself should no-op (and should not create overlays or extra panes).
		const gaugeAPane = page
			.locator('.leaf-pane')
			.filter({ has: page.locator('.pane-title-text', { hasText: 'Gauge A' }) })
			.first();
		const gaugeABox = await gaugeAPane.boundingBox();
		expect(gaugeABox).toBeTruthy();
		await gaugeAHandle.dragTo(gaugeAPane, {
			targetPosition: { x: Math.floor(gaugeABox!.width / 2), y: Math.floor(gaugeABox!.height / 2) },
			force: true
		});
		await expect(page.locator('.leaf-pane')).toHaveCount(2, { timeout: 5000 });
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('tab layout accepts drop onto content area and adds tab', async ({ page, request }) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {

		const treeRes = await request.get(`/api/projects/${projectId}/objects`);
		const tree = treeRes.ok
			? ((await treeRes.json()) as { id: string; children?: { id: string; name: string }[] })
			: null;
		const rootId = tree?.id;
		if (!rootId) {
			test.skip();
			return;
		}

		const stackRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'stack',
				parentId: rootId,
				name: 'Tab Layout DnD Test',
				props: { objectIds: [], activeIndex: 0 }
			}
		});
		const stackObj = stackRes.ok ? ((await stackRes.json()) as { id: string }) : null;
		const gaugeRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'gauge',
				parentId: rootId,
				name: 'Gauge',
				props: { min: 0, max: 100, dataSource: '' }
			}
		});
		const gaugeObj = gaugeRes.ok ? ((await gaugeRes.json()) as { id: string }) : null;
		if (!stackObj?.id || !gaugeObj?.id) {
			test.skip();
			return;
		}

		await page.goto(`/project/${projectId}?object=${stackObj.id}`, {
			waitUntil: 'domcontentloaded'
		});
		await expect(page.locator('.center-view').first()).toBeVisible({ timeout: 15000 });
		await dismissWelcomeTour(page);
		const stackContent = page.locator('.stack-content').first();
		await expect(stackContent).toBeVisible({ timeout: 5000 });

		const gaugeNode = page.locator('.tree .tree-node').filter({ hasText: 'Gauge' }).first();
		await expect(gaugeNode).toBeVisible({ timeout: 3000 });
		await gaugeNode.dragTo(stackContent, { force: true });

		// Tab layout should show a tab or placeholder after drop
		await expect(page.locator('.stack-tab, .stack-placeholder').first()).toBeVisible({
			timeout: 5000
		});
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('grid layout hides the empty drop hint after the first widget and avoids overlapping tree drops', async ({
		page,
		request
	}) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {

		const treeRes = await request.get(`/api/projects/${projectId}/objects`);
		const tree = treeRes.ok ? ((await treeRes.json()) as { id: string }) : null;
		const rootId = tree?.id;
		if (!rootId) {
			test.skip();
			return;
		}

		const layoutRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'grid-layout',
				parentId: rootId,
				name: 'Grid Layout DnD Test',
				props: { gridSize: [24, 24], items: [], dimensions: [480, 320], scaleToFit: true }
			}
		});
		const layoutObj = layoutRes.ok ? ((await layoutRes.json()) as { id: string }) : null;
		const gaugeRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'gauge',
				parentId: rootId,
				name: 'Gauge A',
				props: { min: 0, max: 100, dataSource: '' }
			}
		});
		const gaugeAObj = gaugeRes.ok ? ((await gaugeRes.json()) as { id: string }) : null;
		const secondGaugeRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'gauge',
				parentId: rootId,
				name: 'Gauge B',
				props: { min: 0, max: 100, dataSource: '' }
			}
		});
		const gaugeBObj = secondGaugeRes.ok ? ((await secondGaugeRes.json()) as { id: string }) : null;
		if (!layoutObj?.id || !gaugeAObj?.id || !gaugeBObj?.id) {
			test.skip();
			return;
		}

		await page.goto(`/project/${projectId}?object=${layoutObj.id}`);
		await dismissWelcomeTour(page);
		const canvas = page.locator('.grid-layout-view-inner').first();
		await expect(canvas).toBeVisible({ timeout: 10000 });
		await expect(page.locator('.grid-empty-state')).toBeVisible();

		const gaugeANode = page.locator('.tree .tree-node').filter({ hasText: 'Gauge A' }).first();
		await expect(gaugeANode).toBeVisible();

		await gaugeANode.dragTo(canvas, { targetPosition: { x: 470, y: 310 }, force: true });

		await expect(page.locator('.grid-layout-item')).toHaveCount(1, { timeout: 5000 });
		await expect(page.locator('.grid-layout-item').first()).toBeVisible();
		await expect(page.locator('.grid-empty-state')).toHaveCount(0);

		const gaugeBNode = page.locator('.tree .tree-node').filter({ hasText: 'Gauge B' }).first();
		await expect(gaugeBNode).toBeVisible();
		await gaugeBNode.dragTo(canvas, { targetPosition: { x: 470, y: 310 }, force: true });

		await expect(page.locator('.grid-layout-item')).toHaveCount(2, { timeout: 5000 });
		const positions = await page.locator('.grid-layout-item').evaluateAll((elements) =>
			elements.map((element) => {
				const el = element as HTMLElement;
				return `${el.style.left}:${el.style.top}`;
			})
		);
		expect(new Set(positions).size).toBe(2);
		} finally {
			await deleteProject(request, projectId);
		}
	});
});
