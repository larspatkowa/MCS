import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, secureAuthCookie } from '$lib/server/auth.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const MAX_TRACKED = 10_000;

function isLocked(key: string, now: number): boolean {
	const attempt = attempts.get(key);
	return Boolean(attempt && attempt.resetAt > now && attempt.count >= MAX_ATTEMPTS);
}

function recordFailure(key: string, now: number): void {
	if (!attempts.has(key) && attempts.size >= MAX_TRACKED) {
		// Drop expired entries first; if none, the oldest. Keeps memory bounded.
		for (const [candidate, attempt] of attempts) {
			if (attempt.resetAt <= now) attempts.delete(candidate);
		}
		if (attempts.size >= MAX_TRACKED) attempts.delete(attempts.keys().next().value!);
	}
	const attempt = attempts.get(key);
	const next = attempt && attempt.resetAt > now ? attempt : { count: 0, resetAt: now + WINDOW_MS };
	next.count += 1;
	attempts.set(key, next);
}

export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	try {
		const body = await readJsonObject(request);
		if (typeof body.email !== 'string' || typeof body.password !== 'string') {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}
		// Throttle by address and by account, so rotating addresses cannot
		// keep guessing one password.
		const addressKey = `ip:${getClientAddress()}`;
		const accountKey = `account:${body.email.trim().toLowerCase()}`;
		const now = Date.now();
		if (isLocked(addressKey, now) || isLocked(accountKey, now)) {
			return json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
		}
		const session = login(body.email, body.password);
		if (!session) {
			recordFailure(addressKey, now);
			recordFailure(accountKey, now);
			return json({ error: 'Email or password is incorrect' }, { status: 401 });
		}
		attempts.delete(addressKey);
		attempts.delete(accountKey);
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
