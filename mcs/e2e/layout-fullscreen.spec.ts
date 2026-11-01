import { test, expect, type APIRequestContext } from '@playwright/test';
import { deleteProject } from './e2e-utils';

async function ensureProjectId(request: APIRequestContext): Promise<string | null> {
	const now = Date.now();
	const nonce = Math.random().toString(16).slice(2, 8);
	const createRes = await request.post('/api/projects', {
		data: { name: `E2E Fullscreen ${now}-${nonce}` }
	});
	if (createRes.ok()) {
		const created = (await createRes.json()) as { id?: string };
		if (created.id) return created.id;
	}
	return null;
}

test('fullscreen toggles browser fullscreen for layout views', async ({ page, request }) => {
	const projectId = await ensureProjectId(request);
	if (!projectId) {
		test.skip();
		return;
	}
	try {
		const treeRes = await request.get(`/api/projects/${projectId}/objects`);
		const tree = treeRes.ok() ? ((await treeRes.json()) as { id?: string }) : null;
		const rootId = tree?.id;
		if (!rootId) {
			test.skip();
			return;
		}

		const layoutRes = await request.post(`/api/projects/${projectId}/objects`, {
			data: {
				type: 'flex-layout',
				parentId: rootId,
				name: 'Fullscreen Layout',
				props: {
					root: {
						id: 'root',
						type: 'leaf'
					}
				}
			}
		});
		const layoutObj = layoutRes.ok() ? ((await layoutRes.json()) as { id?: string }) : null;
		if (!layoutObj?.id) {
			test.skip();
			return;
		}

		await page.goto(`/project/${projectId}?object=${layoutObj.id}`);
		const fullscreenButton = page.getByRole('button', { name: 'Fullscreen', exact: true });
		await expect(fullscreenButton).toBeVisible({ timeout: 10000 });

		await fullscreenButton.click();
		await expect
			.poll(() =>
				page.evaluate(
					() => document.fullscreenElement?.hasAttribute('data-layout-fullscreen-root') ?? false
				)
			)
			.toBe(true);

		await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
		await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
	} finally {
		await deleteProject(request, projectId);
	}
});
