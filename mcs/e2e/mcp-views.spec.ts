import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { deleteProject } from './e2e-utils';

async function mcp(request: APIRequestContext, name: string, args: Record<string, unknown>) {
	const response = await request.post('/api/mcp', {
		data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
	});
	expect(response.ok()).toBeTruthy();
	const body = await response.json();
	expect(body.result.isError, body.result.content?.[0]?.text).toBe(false);
	return body.result.structuredContent;
}

test('an agent builds a flight display over MCP and operators see values and alarms', async ({
	page,
	request
}) => {
	const created = await request.post('/api/projects', { data: { name: `MCP ${randomUUID()}` } });
	const project = (await created.json()) as { id: string };
	try {
		const init = await request.post('/api/mcp', {
			data: {
				jsonrpc: '2.0',
				id: 0,
				method: 'initialize',
				params: { protocolVersion: '2025-06-18' }
			}
		});
		expect((await init.json()).result.serverInfo.name).toBe('mcs');

		await mcp(request, 'set_limits', {
			projectId: project.id,
			streamId: 'engine:chamber',
			redHigh: 3000
		});
		const tabs = await mcp(request, 'create_object', {
			projectId: project.id,
			type: 'tabs',
			name: 'Flight'
		});
		await mcp(request, 'create_object', {
			projectId: project.id,
			type: 'values-table',
			name: 'Values',
			parentId: tabs.id,
			props: { dataSources: ['engine:chamber'] }
		});
		await mcp(request, 'create_object', {
			projectId: project.id,
			type: 'event-log',
			name: 'Alarms',
			parentId: tabs.id
		});

		const now = Date.now() / 1000;
		await mcp(request, 'ingest', {
			projectId: project.id,
			samples: [{ streamId: 'engine:chamber', timestamp: now, values: { value: 3456.5 } }]
		});
		const stats = await mcp(request, 'stream_stats', {
			projectId: project.id,
			streamId: 'engine:chamber',
			from: '-1m'
		});
		expect(stats.max.value).toBe(3456.5);

		await page.goto(`/project/${project.id}?object=${tabs.id}`);
		await expect(page.getByRole('tab', { name: 'Values' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		const row = page.getByRole('row', { name: /engine:chamber/ });
		await expect(row).toContainText('3456.500');
		await expect(row).toContainText('CRIT');

		await page.getByRole('tab', { name: 'Alarms' }).click();
		await expect(page.getByText('1 unacknowledged')).toBeVisible();
		await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
		await expect(page.getByText('No unacknowledged alarms')).toBeVisible();

		await page.getByLabel('Log a note').fill('Recovery team dispatched');
		await page.getByRole('button', { name: 'Log', exact: true }).click();
		await expect(page.getByText('Recovery team dispatched')).toBeVisible();
	} finally {
		await deleteProject(request, project.id);
	}
});
