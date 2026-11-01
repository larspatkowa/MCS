import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, secureAuthCookie } from '$lib/server/auth.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	try {
		const body = await readJsonObject(request);
		if (typeof body.email !== 'string' || typeof body.password !== 'string') {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}
		const address = getClientAddress();
		const now = Date.now();
		const attempt = attempts.get(address);
		if (attempt && attempt.resetAt > now && attempt.count >= MAX_ATTEMPTS) {
			return json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
		}
		const session = login(body.email, body.password);
		if (!session) {
			const next =
				attempt && attempt.resetAt > now ? attempt : { count: 0, resetAt: now + WINDOW_MS };
			next.count += 1;
			attempts.set(address, next);
			return json({ error: 'Email or password is incorrect' }, { status: 401 });
		}
		attempts.delete(address);
		cookies.set('mcs_session', session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: secureAuthCookie(url.href),
			maxAge: session.expiresAt - Math.floor(now / 1000)
		});
		return json({ user: session.user });
	} catch (error) {
		return handleApiError(error, 'POST /api/auth/login');
	}
};
