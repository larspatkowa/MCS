import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { stopPlugin } from '$lib/server/plugin-runner';
import * as pluginRegistry from '$lib/server/plugin-registry';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { id } = body as { id: string };
	if (!id) return json({ error: 'id required' }, { status: 400 });
	const stoppedInProcess = pluginRegistry.stopInProcess(id);
	const stopped = stoppedInProcess || stopPlugin(id);
	return json({ ok: stopped });
};
