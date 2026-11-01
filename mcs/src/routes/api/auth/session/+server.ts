import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasUsers, resolveSession } from '$lib/server/auth.js';

export const GET: RequestHandler = ({ cookies }) => {
	const user = resolveSession(cookies.get('mcs_session'));
	return json(
		{ authenticated: Boolean(user), user, setupRequired: !hasUsers() },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
