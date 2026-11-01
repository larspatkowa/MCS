import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../../../hooks.server.js';
import { clearConfigCache } from '../config.js';
import { closeAllProjectDbs } from '../db.js';
import {
	bootstrapAdmin,
	closeAuthDatabases,
	createProjectApiToken,
	createUser,
	login,
	setProjectMembership
} from '../auth.js';
import { createProject } from '../project.js';
import { stopTelemetryRetentionCleanup } from '../retention.js';

const temporaryRoots: string[] = [];

async function callHook(options: {
	path: string;
	method?: string;
	sessionToken?: string;
	apiToken?: string;
	body?: unknown;
	origin?: string;
}): Promise<{ response: Response; resolved: boolean; body?: unknown }> {
	const request = new Request(`http://localhost${options.path}`, {
		method: options.method ?? 'GET',
		headers: {
			...(options.sessionToken ? { cookie: `mcs_session=${options.sessionToken}` } : {}),
			...(options.apiToken ? { authorization: `Bearer ${options.apiToken}` } : {}),
			...(options.origin ? { origin: options.origin } : {}),
			...(options.body === undefined ? {} : { 'content-type': 'application/json' })
		},
		...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
	});
	const event = {
		request,
		cookies: {
			get: (name: string) => (name === 'mcs_session' ? options.sessionToken : undefined)
		},
		locals: {}
	} as unknown as Parameters<typeof handle>[0]['event'];
	let resolved = false;
	let body: unknown;
	const response = await handle({
		event,
		resolve: async (resolvedEvent) => {
			resolved = true;
			if (resolvedEvent.request.method === 'POST') body = await resolvedEvent.request.json();
			return new Response(null, { status: 200 });
		}
	});
	return { response, resolved, body };
}

afterEach(() => {
	stopTelemetryRetentionCleanup();
	closeAllProjectDbs();
	closeAuthDatabases();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	delete process.env.MCS_AUTH_REQUIRED;
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('project authorization middleware', () => {
	it('isolates two user sessions by project and scopes bridge tokens to one ingest project', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-auth-hook-'));
		temporaryRoots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		process.env.MCS_PROJECTS_DIR = join(root, 'projects');
		process.env.MCS_AUTH_REQUIRED = '1';
		clearConfigCache();

		const projectA = createProject(join(root, 'projects', 'a'), 'Project A');
		const projectB = createProject(join(root, 'projects', 'b'), 'Project B');
		const admin = bootstrapAdmin(
			'bootstrap',
			'bootstrap',
			'admin@example.com',
			'Admin',
			'a-long-password-123'
		);
		const viewer = createUser('viewer@example.com', 'Viewer', 'a-long-password-456', admin.id);
		const editor = createUser('editor@example.com', 'Editor', 'a-long-password-789', admin.id);
		setProjectMembership(projectA.id, viewer.id, 'viewer', admin.id);
		setProjectMembership(projectB.id, editor.id, 'editor', admin.id);
		const viewerSession = createUserSession(viewer.email, 'a-long-password-456');
		const editorSession = createUserSession(editor.email, 'a-long-password-789');

		const viewerOwnProject = await callHook({
			path: `/api/projects/${projectA.id}/objects`,
			sessionToken: viewerSession
		});
		const viewerOtherProject = await callHook({
			path: `/api/projects/${projectB.id}/objects`,
			sessionToken: viewerSession
		});
		const editorOwnProject = await callHook({
			path: `/api/projects/${projectB.id}/objects`,
			method: 'POST',
			sessionToken: editorSession,
			origin: 'http://localhost',
			body: { name: 'safe test body' }
		});
		const viewerCannotWrite = await callHook({
			path: `/api/projects/${projectA.id}/objects`,
			method: 'POST',
			sessionToken: viewerSession,
			origin: 'http://localhost',
			body: { name: 'blocked' }
		});
		expect(viewerOwnProject.response.status).toBe(200);
		expect(viewerOtherProject.response.status).toBe(403);
		expect(editorOwnProject.response.status).toBe(200);
		expect(editorOwnProject.body).toEqual({ name: 'safe test body' });
		expect(viewerCannotWrite.response.status).toBe(403);
		expect(viewerCannotWrite.resolved).toBe(false);

		const bridgeToken = createProjectApiToken(projectA.id, 'acquisition', admin.id);
		const allowedBridge = await callHook({
			path: '/api/ingest/v2',
			method: 'POST',
			apiToken: bridgeToken,
			body: { projectId: projectA.id, version: 1 }
		});
		const deniedBridge = await callHook({
			path: '/api/ingest/v2',
			method: 'POST',
			apiToken: bridgeToken,
			body: { projectId: projectB.id, version: 1 }
		});
		expect(allowedBridge.response.status).toBe(200);
		expect(allowedBridge.body).toEqual({ projectId: projectA.id, version: 1 });
		expect(deniedBridge.response.status).toBe(401);
		expect(deniedBridge.resolved).toBe(false);
	});
});

function createUserSession(email: string, password: string): string {
	const session = login(email, password);
	if (!session) throw new Error(`Unable to create session for ${email}`);
	return session.token;
}
