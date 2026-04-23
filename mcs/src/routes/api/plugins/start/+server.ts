import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as runner from '$lib/server/plugin-runner';
import * as pluginRegistry from '$lib/server/plugin-registry';
import { getAvailablePlugins } from '$lib/server/plugins-config';

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.json();
	const { id, name, path, projectId } = body as {
		id: string;
		name: string;
		path: string;
		projectId?: string;
	};
	if (!id) return json({ error: 'id required' }, { status: 400 });
	const available = getAvailablePlugins();
	const descriptor = available.find((p) => p.id === id);
	if (!descriptor) return json({ error: 'Plugin not found' }, { status: 404 });
	const projId = projectId ?? '';
	if (descriptor.type === 'in-process') {
		try {
			pluginRegistry.startInProcess(id, projId);
			return json({ ok: true, pid: 0 });
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start';
			// Treat "already running" as success to allow idempotent calls
			if (message === 'Plugin already running')
				return json({ ok: true, pid: 0, alreadyRunning: true });
			return json({ error: message }, { status: 400 });
		}
	}
	if (!path && descriptor.path) {
		// use descriptor path if body path missing
	}
	const pluginPath = path || descriptor.path;
	if (!pluginPath)
		return json({ error: 'path required for out-of-process plugin' }, { status: 400 });
	const origin = url.origin;
	const apiUrl = `${origin}/api`;
	try {
		const { pid } = await runner.startPlugin(
			{ id, name: name || descriptor.name, path: pluginPath, projectId: projId },
			{ apiUrl, projectId: projId }
		);
		return json({ ok: true, pid });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Failed to start';
		return json({ error: message }, { status: 400 });
	}
};
