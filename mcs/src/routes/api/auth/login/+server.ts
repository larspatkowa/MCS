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
const accountsInFlight = new Set<string>();
/** Addresses that signed in to an account recently skip that account's throttle. */
const knownAddresses = new Map<string, Map<string, number>>();
const KNOWN_ADDRESS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_KNOWN_PER_ACCOUNT = 20;

function isKnownAddress(account: string, address: string, now: number): boolean {
	return (knownAddresses.get(account)?.get(address) ?? 0) > now;
}

function rememberAddress(account: string, address: string, now: number): void {
	let addresses = knownAddresses.get(account);
	if (!addresses) {
		if (knownAddresses.size >= MAX_TRACKED)
			knownAddresses.delete(knownAddresses.keys().next().value!);
		addresses = new Map();
		knownAddresses.set(account, addresses);
	}
	addresses.delete(address);
	addresses.set(address, now + KNOWN_ADDRESS_MS);
	if (addresses.size > MAX_KNOWN_PER_ACCOUNT) addresses.delete(addresses.keys().next().value!);
}

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
 *   From an unfamiliar address, one attempt per account runs at a time (others
 *   get 429 at once, nothing queues) after a delay that grows with recent
 *   failures, up to 30 s. That caps guessing per account.
 * - An address that signed in to the account in the last 30 days skips the
 *   account throttle, so an attacker elsewhere cannot slow the owner down.
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

		const known = isKnownAddress(accountKey, addressKey, now);
		if (!known && accountsInFlight.has(accountKey)) {
			addressesInFlight.delete(addressKey);
			forgiveOne(addressFailures, addressKey);
			return json(
				{ error: 'Another sign-in to this account is in progress. Try again shortly.' },
				{ status: 429 }
			);
		}
		if (!known) accountsInFlight.add(accountKey);
		let session: ReturnType<typeof login>;
		try {
			const failures = known ? 0 : current(accountFailures, accountKey, now);
			if (failures >= 3) {
				const delay = Math.min(MAX_ACCOUNT_DELAY_MS, 250 * 2 ** (failures - 3));
				await new Promise((done) => setTimeout(done, delay));
			}
			session = login(body.email, body.password);
			if (session) {
				forgiveOne(addressFailures, addressKey);
				accountFailures.delete(accountKey);
				rememberAddress(accountKey, addressKey, Date.now());
			} else {
				recordFailure(accountFailures, accountKey, Date.now());
			}
		} finally {
			if (!known) accountsInFlight.delete(accountKey);
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
