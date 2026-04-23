import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache, loadConfig } from '$lib/server/config';
import { createProject } from '$lib/server/project';

const TEST_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'mcs-batch-test-config-'));
const TEST_PROJECTS_BASE = mkdtempSync(join(tmpdir(), 'mcs-batch-test-projects-'));

function makePostEvent(url: string, body: unknown) {
	return {
		params: {},
		getClientAddress: () => '',
		cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
		fetch: globalThis.fetch,
		isDataRequest: false,
		isSubRequest: false,
		locals: {},
		platform: undefined,
		request: new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		route: { id: '' },
		setHeaders: () => {},
		url: new URL(url)
	} as any;
}

describe('API POST /api/projects/batch-delete', () => {
	let idA: string;
	let idB: string;
	let pathA: string;
	let pathB: string;

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = TEST_CONFIG_DIR;
		clearConfigCache();
		pathA = join(TEST_PROJECTS_BASE, 'batch-a');
		pathB = join(TEST_PROJECTS_BASE, 'batch-b');
		idA = createProject(pathA, 'Batch A', '').id;
		idB = createProject(pathB, 'Batch B', '').id;
	});

	afterAll(() => {
		try {
			rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
			rmSync(TEST_PROJECTS_BASE, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it('rejects non-array ids', async () => {
		const { POST } = await import('../projects/batch-delete/+server');
		const res = await POST(
			makePostEvent('http://localhost/api/projects/batch-delete', { ids: 'nope' })
		);
		expect(res.status).toBe(400);
	});

	it('remove from list only leaves folders on disk', async () => {
		clearConfigCache();
		const { POST } = await import('../projects/batch-delete/+server');
		const res = await POST(
			makePostEvent('http://localhost/api/projects/batch-delete', {
				ids: [idA, idB],
				deleteFolder: false
			})
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.results).toHaveLength(2);
		expect(body.results.every((r: { ok: boolean }) => r.ok)).toBe(true);

		const config = loadConfig();
		expect(config.recentProjectPaths).toHaveLength(0);
		expect(existsSync(pathA)).toBe(true);
		expect(existsSync(pathB)).toBe(true);
	});

	it('unknown id is reported as success (idempotent)', async () => {
		clearConfigCache();
		const { POST } = await import('../projects/batch-delete/+server');
		const res = await POST(
			makePostEvent('http://localhost/api/projects/batch-delete', {
				ids: ['00000000-0000-4000-8000-000000000000'],
				deleteFolder: false
			})
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.results[0].ok).toBe(true);
	});
});

describe('API POST /api/projects/batch-delete (disk delete under data/projects)', () => {
	const unique = `mcs-vitest-batch-${Date.now()}`;
	const safeRoot = join(process.cwd(), 'data', 'projects', unique);
	let idDisk: string;
	let projPath: string;

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'mcs-batch-disk-config-'));
		clearConfigCache();
		projPath = join(safeRoot, 'disk-proj');
		idDisk = createProject(projPath, 'Disk Batch', '').id;
	});

	afterAll(() => {
		try {
			rmSync(join(process.cwd(), 'data', 'projects', unique), { recursive: true, force: true });
		} catch {
			// ignore
		}
		try {
			const cfg = process.env.MCS_CONFIG_DIR;
			if (cfg) rmSync(cfg, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it('deleteFolder true removes project folder under data/projects', async () => {
		expect(existsSync(projPath)).toBe(true);
		const { POST } = await import('../projects/batch-delete/+server');
		const res = await POST(
			makePostEvent('http://localhost/api/projects/batch-delete', {
				ids: [idDisk],
				deleteFolder: true
			})
		);
		expect(res.status).toBe(200);
		expect(existsSync(projPath)).toBe(false);
	});
});

describe('API POST /api/projects/batch-delete (unsafe folder)', () => {
	let idTmp: string;
	let tmpProjPath: string;
	let tmpConfig: string;

	beforeAll(() => {
		tmpConfig = mkdtempSync(join(tmpdir(), 'mcs-batch-unsafe-config-'));
		process.env.MCS_CONFIG_DIR = tmpConfig;
		clearConfigCache();
		tmpProjPath = join(mkdtempSync(join(tmpdir(), 'mcs-batch-unsafe-proj-')), 'x');
		idTmp = createProject(tmpProjPath, 'Tmp Unsafe', '').id;
	});

	afterAll(() => {
		try {
			rmSync(tmpConfig, { recursive: true, force: true });
			rmSync(tmpProjPath, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it('deleteFolder true outside data/projects returns failed result and keeps recents', async () => {
		const { POST } = await import('../projects/batch-delete/+server');
		const res = await POST(
			makePostEvent('http://localhost/api/projects/batch-delete', {
				ids: [idTmp],
				deleteFolder: true
			})
		);
		expect(res.status).toBe(207);
		const body = await res.json();
		expect(body.results[0].ok).toBe(false);
		expect(body.results[0].error).toContain('outside allowed base');

		clearConfigCache();
		const config = loadConfig();
		expect(config.recentProjectPaths.map((p) => p.replace(/\\/g, '/'))).toContain(
			tmpProjPath.replace(/\\/g, '/')
		);
		expect(existsSync(tmpProjPath)).toBe(true);
	});
});
