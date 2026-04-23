import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	ensureUserPluginsDir,
	listUserPluginFiles,
	safeUserPluginFilename,
	writeUserPluginFile,
	defaultTemplate
} from '$lib/server/user-plugin-files';

export const GET: RequestHandler = async () => {
	const names = listUserPluginFiles();
	const files = names.map((name) => ({
		name,
		id: name.replace(/\.(mjs|py)$/i, '')
	}));
	return json({ files });
};

export const POST: RequestHandler = async ({ request }) => {
	let body: { ext?: string; stem?: string } = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const ext = body.ext === 'py' ? 'py' : 'mjs';
	const stemRaw = typeof body.stem === 'string' ? body.stem.trim() : '';
	const stem = stemRaw && /^[\w-]+$/.test(stemRaw) ? stemRaw : `user-plugin-${Date.now()}`;
	const filename = `${stem}.${ext}`;
	if (!safeUserPluginFilename(filename)) {
		return json({ error: 'Invalid name' }, { status: 400 });
	}
	ensureUserPluginsDir();
	const existing = listUserPluginFiles();
	if (existing.includes(filename)) {
		return json({ error: 'File already exists' }, { status: 409 });
	}
	const content = defaultTemplate(ext);
	writeUserPluginFile(filename, content);
	return json({ ok: true, name: filename, id: stem });
};
