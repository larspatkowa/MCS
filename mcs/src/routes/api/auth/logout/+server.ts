import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeSession } from '$lib/server/auth.js';

export const POST: RequestHandler = ({ cookies }) => {
	revokeSession(cookies.get('mcs_session'));
	cookies.delete('mcs_session', { path: '/' });
	return json({ ok: true });
};
