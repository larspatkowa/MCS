import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../project.js';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { closeAllProjectDbs } from '../db.js';
import { performIngestBatch } from '../ingest-core.js';
import { handleMcpMessage, parseTime, type McpAccess } from '../mcp.js';

const roots: string[] = [];
const open: McpAccess = { user: null, tokenProjectId: null };

function flightProject() {
	const root = mkdtempSync(join(tmpdir(), 'mcs-mcp-test-'));
	roots.push(root);
	process.env.MCS_CONFIG_DIR = join(root, 'config');
	process.env.MCS_PROJECTS_DIR = join(root, 'projects');
	clearConfigCache();
	const projectPath = join(root, 'projects', 'flight');
	const manifest = createProject(projectPath, 'Flight');
	setDefaultProject(projectPath);
	const t0 = 1_800_000_000;
	performIngestBatch(
		manifest.id,
		Array.from({ length: 60 }, (_, i) => ({
			streamId: 'vehicle:state',
			timestamp: t0 + i,
			values: { alt: 1200 - (i - 30) ** 2, lat: 34.5, lon: -86.7 }
		}))
	);
	return { id: manifest.id, t0 };
}

function call(name: string, args: Record<string, unknown>, access = open) {
	const response = handleMcpMessage(
		{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
		access
	) as { result: { isError: boolean; structuredContent: any; content: { text: string }[] } };
	return response.result;
}

afterEach(() => {
	closeAllProjectDbs();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('MCP server', () => {
	it('negotiates the protocol and lists tools', () => {
		const init = handleMcpMessage(
			{ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
			open
		) as { result: { protocolVersion: string; capabilities: object } };
		expect(init.result.protocolVersion).toBe('2025-03-26');
		expect(init.result.capabilities).toHaveProperty('tools');
		expect(
			handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, open)
		).toBeNull();
		const list = handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, open) as {
			result: { tools: { name: string }[] };
		};
		expect(list.result.tools.map((tool) => tool.name)).toContain('stream_stats');
	});

	it('answers flight questions from stored telemetry', () => {
		const { id, t0 } = flightProject();
		const described = call('describe_project', { projectId: id });
		expect(described.isError).toBe(false);
		expect(described.structuredContent.streams[0]).toMatchObject({
			id: 'vehicle:state',
			fields: expect.arrayContaining(['alt', 'lat', 'lon'])
		});

		const stats = call('stream_stats', {
			projectId: id,
			streamId: 'vehicle:state',
			field: 'alt',
			from: t0,
			to: t0 + 60
		});
		expect(stats.structuredContent.max).toEqual({
			value: 1200,
			at: new Date((t0 + 30) * 1000).toISOString()
		});
		expect(stats.structuredContent.count).toBe(60);

		const history = call('query_history', {
			projectId: id,
			streamId: 'vehicle:state',
			from: t0,
			to: t0 + 60,
			maxSamples: 10
		});
		expect(history.structuredContent.count).toBeLessThanOrEqual(10);
	});

	it('creates displays with defaults inside containers only', () => {
		const { id } = flightProject();
		const stack = call('create_object', { projectId: id, type: 'stack', name: 'Flight' });
		expect(stack.isError).toBe(false);
		const plot = call('create_object', {
			projectId: id,
			type: 'line-plot',
			name: 'Altitude',
			parentId: stack.structuredContent.id,
			props: { dataSources: ['vehicle:state'] }
		});
		expect(plot.structuredContent.props).toMatchObject({
			dataSources: ['vehicle:state'],
			interpolation: 'linear'
		});
		const nested = call('create_object', {
			projectId: id,
			type: 'gauge',
			name: 'Nope',
			parentId: plot.structuredContent.id
		});
		expect(nested.isError).toBe(true);
	});

	it('keeps a project token inside its project', () => {
		const { id } = flightProject();
		const other: McpAccess = { user: null, tokenProjectId: 'another-project' };
		const denied = call('get_latest', { projectId: id }, other);
		expect(denied.isError).toBe(true);
		expect(denied.content[0].text).toMatch(/access denied/i);
		expect(call('list_projects', {}, other).structuredContent.items).toEqual([]);
		const own: McpAccess = { user: null, tokenProjectId: id };
		expect(call('get_latest', { projectId: id }, own).isError).toBe(false);
	});

	it('parses relative and absolute times', () => {
		expect(parseTime('-10m', 0)).toBeCloseTo(Date.now() / 1000 - 600, 0);
		expect(parseTime('2026-01-01T00:00:00Z', 0)).toBe(Date.UTC(2026, 0, 1) / 1000);
		expect(parseTime(undefined, 42)).toBe(42);
	});
});
