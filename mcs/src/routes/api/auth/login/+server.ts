import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, secureAuthCookie } from '$lib/server/auth.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ADDRESS_FAILURES = 8;
const MAX_TRACKED = 10_000;
const MAX_ACCOUNT_DELAY_MS = 5_000;

type Failures = { count: number; resetAt: number };
const addressFailures = new Map<string, Failures>();
const accountFailures = new Map<string, Failures>();

function current(table: Map<string, Failures>, key: string, now: number): number {
	const entry = table.get(key);
	return entry && entry.resetAt > now ? entry.count : 0;
}

function recordFailure(table: Map<string, Failures>, key: string, now: number): void {
	if (!table.has(key) && table.size >= MAX_TRACKED) {
		// Evict expired entries, then the least-failed one, so an attacker
		// cannot flush a throttled address by filling the table.
		for (const [candidate, entry] of table) if (entry.resetAt <= now) table.delete(candidate);
		if (table.size >= MAX_TRACKED) {
			let weakest: string | null = null;
			let fewest = Infinity;
			for (const [candidate, entry] of table) {
				if (entry.count < fewest) [weakest, fewest] = [candidate, entry.count];
			}
			if (weakest) table.delete(weakest);
		}
	}
	const entry = table.get(key);
	const next = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + WINDOW_MS };
	next.count += 1;
	table.set(key, next);
}

/**
 * Throttling:
 * - An address with too many failures is refused for the window.
 * - An account is never locked, because anyone could then lock out its owner.
 *   Repeated failures for an account instead slow every attempt on it by a
 *   growing delay (capped at a few seconds), which rate-limits guessing.
 */
export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	try {
		const body = await readJsonObject(request);
		if (typeof body.email !== 'string' || typeof body.password !== 'string') {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}
		const addressKey = getClientAddress();
		const accountKey = body.email.trim().toLowerCase();
		let now = Date.now();
		if (current(addressFailures, addressKey, now) >= MAX_ADDRESS_FAILURES) {
			return json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
		}
		const accountCount = current(accountFailures, accountKey, now);
		if (accountCount >= 3) {
			const delay = Math.min(MAX_ACCOUNT_DELAY_MS, 250 * 2 ** (accountCount - 3));
			await new Promise((done) => setTimeout(done, delay));
			now = Date.now();
		}
		const session = login(body.email, body.password);
		if (!session) {
			recordFailure(addressFailures, addressKey, now);
			recordFailure(accountFailures, accountKey, now);
			return json({ error: 'Email or password is incorrect' }, { status: 401 });
		}
		addressFailures.delete(addressKey);
		accountFailures.delete(accountKey);
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
