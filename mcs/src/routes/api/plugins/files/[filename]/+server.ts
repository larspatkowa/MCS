import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	readUserPluginFile,
	writeUserPluginFile,
	deleteUserPluginFile,
	safeUserPluginFilename
} from '$lib/server/user-plugin-files';

export const GET: RequestHandler = async ({ params }) => {
	const name = params.filename ?? '';
	try {
		const safe = safeUserPluginFilename(name);
		if (!safe) return json({ error: 'Invalid filename' }, { status: 400 });
		const content = readUserPluginFile(name);
		return json({ name: safe, content });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Error';
		if (msg === 'Not found') return json({ error: msg }, { status: 404 });
		if (msg === 'Invalid filename') return json({ error: msg }, { status: 400 });
		return json({ error: msg }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const name = params.filename ?? '';
	let content = '';
	try {
		const body = await request.json();
		content = typeof body?.content === 'string' ? body.content : '';
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	try {
		writeUserPluginFile(name, content);
		return json({ ok: true });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Error';
		if (msg === 'Invalid filename') return json({ error: msg }, { status: 400 });
		return json({ error: msg }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const name = params.filename ?? '';
	try {
		deleteUserPluginFile(name);
		return json({ ok: true });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Error';
		if (msg === 'Not found') return json({ error: msg }, { status: 404 });
		if (msg === 'Invalid filename') return json({ error: msg }, { status: 400 });
		return json({ error: msg }, { status: 500 });
	}
};
