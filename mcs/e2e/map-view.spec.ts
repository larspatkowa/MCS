import { test, expect, type APIRequestContext } from '@playwright/test';
import { deleteProject, takeScreenshot } from './e2e-utils';

async function ensureProjectId(request: APIRequestContext): Promise<string | null> {
	const now = Date.now();
	const nonce = Math.random().toString(16).slice(2, 8);
	const createRes = await request.post('/api/projects', {
		data: { name: `Map E2E ${now}-${nonce}`, path: `./data/projects/map-e2e-${now}-${nonce}` }
	});
	if (createRes.ok()) {
		const created = (await createRes.json()) as { id?: string };
		if (created.id) return created.id;
	}
	return null;
}

async function getRootId(request: APIRequestContext, projectId: string): Promise<string | null> {
	const treeRes = await request.get(`/api/projects/${projectId}/objects`);
	if (!treeRes.ok()) return null;
	const tree = (await treeRes.json()) as { id?: string };
	return tree.id ?? null;
}

test.describe('Map view', () => {
	test('renders Leaflet map with ingested trail data', async ({ page, request }, testInfo) => {
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

			const createRes = await request.post(`/api/projects/${projectId}/objects`, {
				data: {
					type: 'map-view',
					parentId: rootId,
					name: 'Map View E2E',
					props: {
						dataSource: 'map-e2e-stream',
						trailSource: 'map-e2e-stream',
						latitudeField: 'lat',
						longitudeField: 'lon',
						altitudeField: 'alt',
						baseLayer: 'osm',
						showTrail: true,
						showPredictedOrbit: false
					}
				}
			});
			if (!createRes.ok()) {
				test.skip();
				return;
			}
			const obj = (await createRes.json()) as { id?: string };
			if (!obj.id) {
				test.skip();
				return;
			}

			// Ingest a few position samples
			for (let i = 0; i < 3; i++) {
				await request.post('/api/ingest', {
					data: {
						projectId,
						streamId: 'map-e2e-stream',
						timestamp: Date.now() / 1000 - (2 - i) * 30,
						values: { lat: 35.4 + i * 0.5, lon: -120.1 + i * 0.8, alt: 421000 + i * 200 }
					}
				});
			}

			await page.goto(`/project/${projectId}?object=${obj.id}`);
			await expect(page.locator('.map-view')).toBeVisible({ timeout: 12000 });
			await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 12000 });
			await takeScreenshot(page, testInfo, 'map-view-e2e.png', { fullPage: true });
		} finally {
			await deleteProject(request, projectId);
		}
	});

	test('function plot renders expression data', async ({ page, request }, testInfo) => {
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

			const createRes = await request.post(`/api/projects/${projectId}/objects`, {
				data: {
					type: 'function-plot',
					parentId: rootId,
					name: 'Function Plot E2E',
					props: { expression: '40 + 25 * sin(t / 10)', sampleCount: 180, color: '#22d3ee' }
				}
			});
			if (!createRes.ok()) {
				test.skip();
				return;
			}
			const obj = (await createRes.json()) as { id?: string };
			if (!obj.id) {
				test.skip();
				return;
			}

			await page.goto(`/project/${projectId}?object=${obj.id}`);
			await expect(page.locator('.chart-container')).toBeVisible({ timeout: 10000 });
			await takeScreenshot(page, testInfo, 'function-plot-e2e.png', { fullPage: true });
		} finally {
			await deleteProject(request, projectId);
		}
	});
});
