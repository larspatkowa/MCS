import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache } from '$lib/server/config';
import { closeAllProjectDbs } from '$lib/server/db';
import { createProject } from '$lib/server/project';
import { getStreamSamples } from '$lib/server/streams-db';
import {
	MAX_BATCH_SIZE,
	MAX_JSON_BODY_BYTES,
	validateIdentifier,
	validateSample
} from '$lib/server/ingest-validation';

const configDirectory = mkdtempSync(join(tmpdir(), 'mcs-ingest-config-'));
const projectsDirectory = mkdtempSync(join(tmpdir(), 'mcs-ingest-projects-'));

function eventFor(request: Request, projectId?: string, streamId = 'sensor:raw') {
	return {
		params: projectId ? { id: projectId, streamId } : {},
		request,
		url: new URL(request.url),
		fetch: globalThis.fetch,
		cookies: { get: () => '', set: () => {}, delete: () => {}, getAll: () => [] },
		getClientAddress: () => '',
		isDataRequest: false,
		isSubRequest: false,
		locals: {},
		platform: undefined,
		route: { id: '' },
		setHeaders: () => {}
	} as any;
}

describe('ingest and sample query validation', () => {
	let projectId: string;
	let projectPath: string;

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = configDirectory;
		process.env.MCS_PROJECTS_DIR = projectsDirectory;
		clearConfigCache();
		projectPath = join(projectsDirectory, 'validation');
		projectId = createProject(projectPath, 'Validation').id;
	});

	afterAll(() => {
		closeAllProjectDbs();
		clearConfigCache();
		delete process.env.MCS_CONFIG_DIR;
		delete process.env.MCS_PROJECTS_DIR;
		rmSync(configDirectory, { recursive: true, force: true });
		rmSync(projectsDirectory, { recursive: true, force: true });
	});

	it('returns 400 for malformed ingest JSON', async () => {
		const { POST } = await import('../ingest/+server');
		const request = new Request('http://localhost/api/ingest', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{'
		});
		const response = await POST(eventFor(request));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
	});

	it('validates an entire batch before writing any sample', async () => {
		const { POST } = await import('../ingest/batch/+server');
		const request = new Request('http://localhost/api/ingest/batch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				projectId,
				samples: [
					{ streamId: 'sensor:raw', timestamp: 1, values: { value: 1 } },
					{ streamId: 'sensor:raw', timestamp: 'bad', values: { value: 2 } }
				]
			})
		});
		const response = await POST(eventFor(request));
		expect(response.status).toBe(400);
		expect(getStreamSamples(projectPath, 'sensor:raw')).toEqual([]);
	});

	it('returns the newest limited window in chronological order', async () => {
		const { POST } = await import('../ingest/+server');
		for (const timestamp of [1, 2, 3]) {
			const request = new Request('http://localhost/api/ingest', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId,
					streamId: 'sensor:raw',
					timestamp,
					values: { value: timestamp }
				})
			});
			expect((await POST(eventFor(request))).status).toBe(200);
		}
		const { GET } = await import('../projects/[id]/streams/[streamId]/samples/+server');
		const request = new Request(
			`http://localhost/api/projects/${projectId}/streams/sensor%3Araw/samples?limit=2`
		);
		const response = await GET(eventFor(request, projectId));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.data.map((sample: { timestamp: number }) => sample.timestamp)).toEqual([2, 3]);
	});

	it('returns durable event IDs for a live seed and catches late events up by arrival cursor', async () => {
		const { POST } = await import('../ingest/+server');
		for (const timestamp of [10, 20, 30]) {
			const request = new Request('http://localhost/api/ingest', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					projectId,
					streamId: 'sensor:cursor',
					timestamp,
					values: { value: timestamp }
				})
			});
			expect((await POST(eventFor(request))).status).toBe(200);
		}
		const { GET } = await import('../projects/[id]/streams/[streamId]/samples/+server');
		const seedRequest = new Request(
			`http://localhost/api/projects/${projectId}/streams/sensor%3Acursor/samples?limit=2&includeEventIds=1`
		);
		const seedResponse = await GET(eventFor(seedRequest, projectId, 'sensor:cursor'));
		const seed = await seedResponse.json();
		const cursor = Math.max(...seed.data.map((sample: { eventId: number }) => sample.eventId));
		expect(seed.data.map((sample: { timestamp: number }) => sample.timestamp)).toEqual([20, 30]);

		const lateRequest = new Request('http://localhost/api/ingest', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				projectId,
				streamId: 'sensor:cursor',
				timestamp: 15,
				values: { value: 15 }
			})
		});
		expect((await POST(eventFor(lateRequest))).status).toBe(200);
		const catchupRequest = new Request(
			`http://localhost/api/projects/${projectId}/streams/sensor%3Acursor/samples?afterEventId=${cursor}&limit=10`
		);
		const catchupResponse = await GET(eventFor(catchupRequest, projectId, 'sensor:cursor'));
		expect((await catchupResponse.json()).data).toMatchObject([
			{ timestamp: 15, value: 15, eventId: cursor + 1 }
		]);
	});

	it('rejects invalid sample query bounds and limits', async () => {
		const { GET } = await import('../projects/[id]/streams/[streamId]/samples/+server');
		for (const query of [
			'limit=0',
			'limit=1.5',
			'limit=100001',
			'from=2&to=1',
			'from=NaN',
			'afterEventId=-1'
		]) {
			const request = new Request(
				`http://localhost/api/projects/${projectId}/streams/sensor%3Araw/samples?${query}`
			);
			expect((await GET(eventFor(request, projectId))).status).toBe(400);
		}
	});

	it('rejects unsafe identifiers, oversized values, and oversized bodies', async () => {
		expect(() => validateIdentifier('../outside', 'streamId')).toThrow();
		expect(() =>
			validateSample({
				streamId: 'sensor:raw',
				timestamp: 1,
				values: { nested: { value: 'x'.repeat(16_385) } }
			})
		).toThrow();
		const { POST } = await import('../ingest/batch/+server');
		const request = new Request('http://localhost/api/ingest/batch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				projectId,
				samples: Array.from({ length: MAX_BATCH_SIZE + 1 }, () => ({
					streamId: 'sensor:raw',
					values: {}
				}))
			})
		});
		expect((await POST(eventFor(request))).status).toBe(400);
		const oversized = new Request('http://localhost/api/ingest', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'content-length': String(MAX_JSON_BODY_BYTES + 1)
			},
			body: '{}'
		});
		expect((await (await import('../ingest/+server')).POST(eventFor(oversized))).status).toBe(400);
	});
});
