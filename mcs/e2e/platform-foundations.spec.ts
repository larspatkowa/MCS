import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { deleteProject } from './e2e-utils';

test('a project accepts normalized readings and replays a canonical run package', async ({
	page,
	request
}) => {
	const runId = randomUUID();
	const sourceResponse = await request.post('/api/projects', {
		data: { name: `Source ${runId}` }
	});
	expect(sourceResponse.ok()).toBeTruthy();
	const source = (await sourceResponse.json()) as { id: string };

	const targetResponse = await request.post('/api/projects', {
		data: { name: `Replay Target ${runId}` }
	});
	expect(targetResponse.ok()).toBeTruthy();
	const target = (await targetResponse.json()) as { id: string };

	try {
		await page.goto(`/project/${source.id}`);
		const beforeResponse = await request.get(
			`/api/projects/${source.id}/streams/sensor%3Araw/samples?limit=10`
		);
		expect(beforeResponse.ok()).toBeTruthy();
		expect((await beforeResponse.json()).data).toEqual([]);

		const timestamp = Math.floor(Date.now() / 1000) - 5;
		const ingestResponse = await request.post('/api/ingest/batch', {
			data: {
				projectId: source.id,
				samples: [
					{
						streamId: 'sensor:raw',
						timestamp,
						values: { value: 8_388_607 }
					},
					{
						streamId: 'sensor:mass',
						timestamp,
						values: { value: 1.25 }
					}
				]
			}
		});
		expect(ingestResponse.ok()).toBeTruthy();

		const sourcePackage =
			[
				JSON.stringify({
					type: 'sample',
					streamId: 'sensor:raw',
					timestamp,
					values: { value: 8_388_607 }
				}),
				JSON.stringify({
					type: 'sample',
					streamId: 'sensor:mass',
					timestamp,
					values: { value: 1.25 }
				})
			].join('\n') + '\n';
		const sourceRunImport = await page.evaluate(
			async ({ projectId, text }) => {
				const form = new FormData();
				form.set('file', new File([text], 'source.ndjson', { type: 'application/x-ndjson' }));
				const response = await fetch(`/api/projects/${projectId}/runs/import`, {
					method: 'POST',
					body: form
				});
				return { ok: response.ok, body: await response.json() };
			},
			{ projectId: source.id, text: sourcePackage }
		);
		expect(sourceRunImport.ok).toBeTruthy();
		const sourceRun = sourceRunImport.body;

		const exportResponse = await request.get(
			`/api/projects/${source.id}/runs/${sourceRun.run.id}/export`
		);
		expect(exportResponse.ok()).toBeTruthy();
		expect(exportResponse.headers()['content-type']).toContain('application/x-ndjson');
		const log = await exportResponse.text();
		expect(log).toContain('mcs-run-package');
		expect(log).toContain('sensor:raw');
		expect(log).toContain('8388607');

		const importResponse = await page.evaluate(
			async ({ projectId, text }) => {
				const form = new FormData();
				form.set('file', new File([text], 'source.ndjson', { type: 'application/x-ndjson' }));
				const response = await fetch(`/api/projects/${projectId}/runs/import`, {
					method: 'POST',
					body: form
				});
				return { ok: response.ok, body: await response.json() };
			},
			{ projectId: target.id, text: log }
		);
		expect(importResponse.ok).toBeTruthy();
		const imported = importResponse.body;
		expect(imported.samples).toBe(2);

		const replayedResponse = await request.get(
			`/api/projects/${target.id}/runs/${imported.run.id}/events?limit=10`
		);
		expect(replayedResponse.ok()).toBeTruthy();
		const replayed = await replayedResponse.json();
		expect(replayed.events).toHaveLength(2);
		expect(
			replayed.events.find((event: { streamId: string }) => event.streamId === 'sensor:raw')
		).toMatchObject({
			streamId: 'sensor:raw',
			timestamp,
			values: { value: 8_388_607 }
		});

		await page.goto(`/project/${target.id}`);
		await page.getByLabel('Recorded run').selectOption(imported.run.id);
		await page.getByRole('button', { name: 'Replay', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Play replay', exact: true })).toBeVisible();
	} finally {
		await deleteProject(request, source.id);
		await deleteProject(request, target.id);
	}
});

test('versioned telemetry aligns source clocks, retains history, and exposes source health', async ({
	page,
	request
}) => {
	const projectResponse = await request.post('/api/projects', {
		data: { name: `Time aware ${randomUUID()}` }
	});
	expect(projectResponse.ok()).toBeTruthy();
	const project = (await projectResponse.json()) as { id: string };
	const targetUtc = 1_700_000_000.25;
	const gpsRaw = targetUtc - 315_964_800 + 18;

	try {
		const utcConfig = await request.put(`/api/projects/${project.id}/sources/utc-receiver`, {
			data: {
				name: 'UTC Receiver',
				timeSystem: 'UTC',
				timestampUnit: 'seconds',
				clockOffsetSeconds: 1.25,
				clockUncertaintyMs: 5,
				expectedPeriodMs: 1000
			}
		});
		expect(utcConfig.ok()).toBeTruthy();
		const utcIngest = await request.post('/api/ingest/v2', {
			data: {
				version: 1,
				projectId: project.id,
				source: {
					id: 'utc-receiver',
					name: 'UTC Receiver',
					timeSystem: 'UTC',
					timestampUnit: 'seconds'
				},
				samples: [
					{
						streamId: 'vehicle:altitude',
						sourceTimestamp: { value: targetUtc - 1.25, unit: 'seconds', timeSystem: 'UTC' },
						sequence: 1,
						idempotencyKey: 'utc-1',
						values: { value: 100 }
					}
				]
			}
		});
		expect(utcIngest.ok()).toBeTruthy();

		const gpsConfig = await request.put(`/api/projects/${project.id}/sources/gps-receiver`, {
			data: {
				name: 'GPS Receiver',
				timeSystem: 'GPS',
				timestampUnit: 'seconds',
				clockUncertaintyMs: 100,
				expectedPeriodMs: 1000
			}
		});
		expect(gpsConfig.ok()).toBeTruthy();
		const ingestGps = async (samples: Array<Record<string, unknown>>) =>
			request.post('/api/ingest/v2', {
				data: {
					version: 1,
					projectId: project.id,
					source: {
						id: 'gps-receiver',
						name: 'GPS Receiver',
						timeSystem: 'GPS',
						timestampUnit: 'seconds'
					},
					samples
				}
			});
		const firstGpsBatch = await ingestGps([
			{
				streamId: 'vehicle:altitude',
				sourceTimestamp: { value: gpsRaw, unit: 'seconds', timeSystem: 'GPS' },
				sequence: 10,
				idempotencyKey: 'gps-10',
				values: { value: 10 },
				quality: { clock: 'good', clockUncertaintySeconds: 0.1 }
			},
			{
				streamId: 'vehicle:altitude',
				sourceTimestamp: { value: gpsRaw + 2, unit: 'seconds', timeSystem: 'GPS' },
				sequence: 12,
				idempotencyKey: 'gps-12',
				values: { value: 12 },
				quality: { clock: 'good', clockUncertaintySeconds: 0.1 }
			}
		]);
		expect(firstGpsBatch.ok()).toBeTruthy();
		const gapStatus = await request.get(`/api/projects/${project.id}/sources`);
		const gapSource = (await gapStatus.json()).sources.find(
			(source: { id: string }) => source.id === 'gps-receiver'
		);
		expect(gapSource).toMatchObject({
			status: 'fresh',
			missingSequenceCount: 1,
			openGapCount: 1,
			lastClockQuality: 'good'
		});

		const historyUrl = `/api/projects/${project.id}/telemetry/history?sourceId=gps-receiver&streamId=vehicle%3Aaltitude&from=${targetUtc - 1}&to=${targetUtc + 3}`;
		const rawHistoryResponse = await request.get(`${historyUrl}&resolution=raw&maxSamples=10`);
		expect(rawHistoryResponse.ok()).toBeTruthy();
		const rawHistory = await rawHistoryResponse.json();
		expect(rawHistory.samples.map((sample: { sequence: number }) => sample.sequence)).toEqual([
			10, 12
		]);
		expect(rawHistory.samples[0]).toMatchObject({
			sourceTimestamp: { value: gpsRaw, unit: 'seconds', timeSystem: 'GPS' },
			eventTimeUtc: targetUtc
		});
		const reducedResponse = await request.get(
			`${historyUrl}&resolution=minmax&field=value&maxSamples=2`
		);
		expect(reducedResponse.ok()).toBeTruthy();
		expect(
			(await reducedResponse.json()).samples
				.map((sample: { values: { value: number } }) => sample.values.value)
				.sort()
		).toEqual([10, 12]);

		const duplicateResponse = await ingestGps([
			{
				streamId: 'vehicle:altitude',
				sourceTimestamp: { value: gpsRaw + 2, unit: 'seconds', timeSystem: 'GPS' },
				sequence: 12,
				idempotencyKey: 'gps-12',
				values: { value: 12 },
				quality: { clock: 'good', clockUncertaintySeconds: 0.1 }
			}
		]);
		expect(await duplicateResponse.json()).toMatchObject({ accepted: 0, acceptedIds: ['gps-12'] });
		const lateResponse = await ingestGps([
			{
				streamId: 'vehicle:altitude',
				sourceTimestamp: { value: gpsRaw + 1, unit: 'seconds', timeSystem: 'GPS' },
				sequence: 11,
				idempotencyKey: 'gps-11',
				values: { value: -4 },
				quality: { clock: 'good', clockUncertaintySeconds: 0.1 }
			}
		]);
		expect(lateResponse.ok()).toBeTruthy();
		const resolvedStatus = await request.get(`/api/projects/${project.id}/sources`);
		const resolvedSource = (await resolvedStatus.json()).sources.find(
			(source: { id: string }) => source.id === 'gps-receiver'
		);
		expect(resolvedSource).toMatchObject({ missingSequenceCount: 0, openGapCount: 0 });

		const utcHistoryResponse = await request.get(
			`/api/projects/${project.id}/telemetry/history?sourceId=utc-receiver&streamId=vehicle%3Aaltitude&from=${targetUtc - 1}&to=${targetUtc + 1}&resolution=raw&maxSamples=10`
		);
		const utcSample = (await utcHistoryResponse.json()).samples[0];
		expect(utcSample.sourceTimestamp.value).toBe(targetUtc - 1.25);
		expect(utcSample.eventTimeUtc).toBeCloseTo(targetUtc);

		await page.setViewportSize({ width: 1280, height: 850 });
		// Without a stored choice the theme follows the operating system.
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto(`/project/${project.id}`);
		await expect(page.locator('html')).toHaveClass(/theme-dark/);
		const sourceSummary = page.locator('details.source-status summary');
		await sourceSummary.click();
		await expect(page.locator('details.source-status')).toContainText('GPS · Clock good');
		await expect(page.locator('details.source-status')).toContainText('±100 ms');
		await sourceSummary.click();
		const lightThemeButton = page.getByRole('button', { name: 'Switch to light mode' });
		await expect(lightThemeButton).toBeVisible();
		await lightThemeButton.click();
		await expect(page.locator('html')).toHaveClass(/theme-light/);
		await page.getByRole('button', { name: 'Switch to dark mode' }).click();
		await expect(page.locator('html')).toHaveClass(/theme-dark/);

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(sourceSummary).toContainText('2/2 fresh');
		await sourceSummary.focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('details.source-status')).toHaveAttribute('open', '');
		await expect(page.locator('details.source-status')).toContainText('GPS Receiver');
		await expect(page.getByLabel('Time mode')).toBeVisible();
	} finally {
		await deleteProject(request, project.id);
	}
});
