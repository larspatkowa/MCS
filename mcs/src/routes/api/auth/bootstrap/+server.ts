import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bootstrapAdmin, login, secureAuthCookie } from '$lib/server/auth.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	try {
		const body = await readJsonObject(request);
		const values = ['bootstrapToken', 'email', 'displayName', 'password'] as const;
		for (const key of values) {
			if (typeof body[key] !== 'string')
				return json({ error: `${key} is required` }, { status: 400 });
		}
		const user = bootstrapAdmin(
			process.env.MCS_BOOTSTRAP_TOKEN ?? '',
			body.bootstrapToken as string,
			body.email as string,
			body.displayName as string,
			body.password as string
		);
		const session = login(user.email, body.password as string);
		if (!session) return json({ error: 'Unable to create initial session' }, { status: 500 });
		cookies.set('mcs_session', session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: secureAuthCookie(url.href),
			maxAge: session.expiresAt - Math.floor(Date.now() / 1000)
		});
		return json({ user: session.user });
	} catch (error) {
		return handleApiError(error, 'POST /api/auth/bootstrap');
	}
};
