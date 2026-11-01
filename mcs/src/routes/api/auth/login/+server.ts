import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { login, secureAuthCookie } from '$lib/server/auth.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ADDRESS_FAILURES = 8;
const MAX_TRACKED = 10_000;
const MAX_ACCOUNT_DELAY_MS = 30_000;

type Failures = { count: number; resetAt: number };
const addressFailures = new Map<string, Failures>();
const accountFailures = new Map<string, Failures>();
const addressesInFlight = new Set<string>();
/** Tail of each account's attempt queue; attempts on one account run in turn. */
const accountQueues = new Map<string, Promise<void>>();

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

function forgiveOne(table: Map<string, Failures>, key: string): void {
	const entry = table.get(key);
	if (entry && entry.count > 0) entry.count -= 1;
}

/**
 * Throttling:
 * - Every attempt is charged to its address before any waiting, and given
 *   back only on success, so parallel requests cannot all pass the check.
 *   An address has one attempt in flight at a time and is refused after
 *   repeated failures.
 * - An account is never locked, because anyone could then lock out its owner.
 *   Attempts on one account run one at a time, each after a delay that grows
 *   with recent failures (up to 30 s), which caps guessing per account.
 */
export const POST: RequestHandler = async ({ request, cookies, url, getClientAddress }) => {
	try {
		const body = await readJsonObject(request);
		if (typeof body.email !== 'string' || typeof body.password !== 'string') {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}
		const addressKey = getClientAddress();
		const accountKey = body.email.trim().toLowerCase();
		const now = Date.now();
		if (
			current(addressFailures, addressKey, now) >= MAX_ADDRESS_FAILURES ||
			addressesInFlight.has(addressKey)
		) {
			return json({ error: 'Too many sign-in attempts. Try again later.' }, { status: 429 });
		}
		addressesInFlight.add(addressKey);
		recordFailure(addressFailures, addressKey, now);

		const previous = accountQueues.get(accountKey) ?? Promise.resolve();
		let release!: () => void;
		const turn = new Promise<void>((done) => (release = done));
		const tail = previous.then(() => turn);
		accountQueues.set(accountKey, tail);
		let session: ReturnType<typeof login>;
		try {
			await previous;
			const failures = current(accountFailures, accountKey, Date.now());
			if (failures >= 3) {
				const delay = Math.min(MAX_ACCOUNT_DELAY_MS, 250 * 2 ** (failures - 3));
				await new Promise((done) => setTimeout(done, delay));
			}
			session = login(body.email, body.password);
			if (session) {
				forgiveOne(addressFailures, addressKey);
				accountFailures.delete(accountKey);
			} else {
				recordFailure(accountFailures, accountKey, Date.now());
			}
		} finally {
			release();
			if (accountQueues.get(accountKey) === tail) accountQueues.delete(accountKey);
			addressesInFlight.delete(addressKey);
		}
		if (!session) return json({ error: 'Email or password is incorrect' }, { status: 401 });
		cookies.set('mcs_session', session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: secureAuthCookie(url.href),
			maxAge: session.expiresAt - Math.floor(Date.now() / 1000)
		});
		return json({ user: session.user });
	} catch (error) {
		return handleApiError(error, 'POST /api/auth/login');
	}
};
