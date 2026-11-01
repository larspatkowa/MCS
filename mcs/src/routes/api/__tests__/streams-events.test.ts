import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache } from '$lib/server/config.js';
import { closeAllProjectDbs } from '$lib/server/db.js';
import { performIngestBatch } from '$lib/server/ingest-core.js';
import { createProject } from '$lib/server/project.js';
import { GET as getStreamEvents } from '../projects/[id]/streams/events/+server.js';

const configDirectory = mkdtempSync(join(tmpdir(), 'mcs-stream-events-config-'));
const projectsDirectory = mkdtempSync(join(tmpdir(), 'mcs-stream-events-projects-'));

function eventFor(request: Request, projectId: string) {
	return { params: { id: projectId }, request } as Parameters<typeof getStreamEvents>[0];
}

describe('durable SSE history and resume cursor', () => {
	let projectId: string;
	let projectPath: string;

	beforeAll(() => {
		process.env.MCS_CONFIG_DIR = configDirectory;
		process.env.MCS_PROJECTS_DIR = projectsDirectory;
		clearConfigCache();
		projectPath = join(projectsDirectory, 'stream-events');
		projectId = createProject(projectPath, 'Stream Events').id;
	});

	afterAll(() => {
		closeAllProjectDbs();
		clearConfigCache();
		delete process.env.MCS_CONFIG_DIR;
		delete process.env.MCS_PROJECTS_DIR;
		rmSync(configDirectory, { recursive: true, force: true });
		rmSync(projectsDirectory, { recursive: true, force: true });
	});

	it('starts new displays at a checkpoint and resumes requested event history', async () => {
		performIngestBatch(projectId, [
			{ streamId: 'sensor:raw', timestamp: 10, values: { value: 10 } }
		]);

		const freshResponse = await getStreamEvents(
			eventFor(new Request(`http://localhost/api/projects/${projectId}/streams/events`), projectId)
		);
		const freshReader = freshResponse.body!.getReader();
		const freshChunk = await freshReader.read();
		const freshText = new TextDecoder().decode(freshChunk.value);
		expect(freshText).toContain('id: 1');
		expect(freshText).toContain('"type":"checkpoint"');
		expect(freshText).not.toContain('"value":10');
		await freshReader.cancel();

		const resumeResponse = await getStreamEvents(
			eventFor(
				new Request(`http://localhost/api/projects/${projectId}/streams/events`, {
					headers: { 'last-event-id': '0' }
				}),
				projectId
			)
		);
		const resumeReader = resumeResponse.body!.getReader();
		const resumed = await resumeReader.read();
		const resumedText = new TextDecoder().decode(resumed.value);
		expect(resumedText).toContain('id: 1');
		expect(resumedText).toContain('"value":10');
		await resumeReader.cancel();
	});
});
