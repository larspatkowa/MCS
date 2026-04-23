import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteProjectById } from '$lib/server/project-delete';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const rec = body as { ids?: unknown; deleteFolder?: unknown };
	if (!Array.isArray(rec.ids) || !rec.ids.every((id): id is string => typeof id === 'string')) {
		return json({ error: 'ids must be an array of strings' }, { status: 400 });
	}

	const deleteFolder = rec.deleteFolder === true;

	const results = rec.ids.map((id) => {
		const outcome = deleteProjectById(id, deleteFolder);
		if (outcome.ok) {
			return { id, ok: true as const };
		}
		return { id, ok: false as const, error: outcome.error };
	});

	const anyFailed = results.some((r) => !r.ok);
	return json({ results }, { status: anyFailed ? 207 : 200 });
};
