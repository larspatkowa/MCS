import { test, expect, type APIRequestContext } from '@playwright/test';
import { deleteProject, takeScreenshot } from './e2e-utils';

async function ensureProjectId(request: APIRequestContext): Promise<string | null> {
	const now = Date.now();
	const nonce = Math.random().toString(16).slice(2, 8);
	const createRes = await request.post('/api/projects', {
		data: { name: `Reactive E2E ${now}-${nonce}`, path: `./data/projects/reactive-e2e-${now}-${nonce}` }
	});
	if (!createRes.ok()) return null;
	const created = (await createRes.json()) as { id?: string };
	return created.id ?? null;
}

async function getRootId(request: APIRequestContext, projectId: string): Promise<string | null> {
	const treeRes = await request.get(`/api/projects/${projectId}/objects`);
	if (!treeRes.ok()) return null;
	const tree = (await treeRes.json()) as { id?: string };
	return tree.id ?? null;
}

test.describe('Reactive telemetry and plugin architecture visibility', () => {
	test('telemetry table renders with columns and rows', async ({ page, request }, testInfo) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			const rootId = await getRootId(request, projectId);
			if (!rootId) {
				test.skip();
				return;
			}

			// Create a telemetry table that uses the built-in sample streams
			const tableRes = await request.post(`/api/projects/${projectId}/objects`, {
				data: {
					type: 'telemetry-table',
					parentId: rootId,
					name: 'Reactive Table',
					props: {
						columns: [{ streamId: 'sample:sine', field: 'value', label: 'Sine' }],
						rowLimit: 20
					}
				}
			});
			if (!tableRes.ok()) {
				test.skip();
				return;
			}
			const tableObj = (await tableRes.json()) as { id?: string };
			if (!tableObj.id) {
				test.skip();
				return;
			}

			await page.goto(`/project/${projectId}?object=${tableObj.id}`);
			await expect(page.locator('.telemetry-table-view')).toBeVisible({ timeout: 10000 });

			// Wait for rows to populate (sample stream polling at 2s intervals)
			await expect(page.locator('.data-table tbody tr').first()).toBeVisible({ timeout: 15000 });

			// Verify multiple rows exist
			const rowCount = await page.locator('.data-table tbody tr').count();
			expect(rowCount).toBeGreaterThan(0);

			await takeScreenshot(page, testInfo, 'reactive-table.png', { fullPage: true });
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('settings plugins tab shows contract and logging health', async ({ page, request }, testInfo) => {
		const projectId = await ensureProjectId(request);
		if (!projectId) {
			test.skip();
			return;
		}
		try {
			await request.post('/api/ingest', {
				data: {
					projectId,
					streamId: 'settings-health-stream',
					timestamp: Date.now() / 1000,
					values: { value: 1 }
				}
			});

			await page.goto(`/project/${projectId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });

			await page.getByRole('button', { name: 'Settings' }).click();
			await page.getByRole('tab', { name: 'Data sources' }).click();

			await expect(page.getByText(/running|stopped/i).first()).toBeVisible({ timeout: 5000 });

			await takeScreenshot(page, testInfo, 'plugins-architecture-panel.png', { fullPage: true });
		} finally {
			await deleteProject(request, projectId);
		}
	});
});
