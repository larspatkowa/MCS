import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST } from '../auth/login/+server.js';
import { bootstrapAdmin, closeAuthDatabases } from '$lib/server/auth.js';
import { clearConfigCache } from '$lib/server/config.js';

const roots: string[] = [];

async function attempt(
	address: string,
	password: string,
	email = 'admin@example.com'
): Promise<number> {
	const request = new Request('http://localhost/api/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const response = await POST({
		request,
		url: new URL(request.url),
		cookies: { set: () => {} },
		getClientAddress: () => address
	} as unknown as Parameters<typeof POST>[0]);
	return response.status;
}

afterEach(() => {
	closeAuthDatabases();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('sign-in throttling', () => {
	it('slows guessing on an account without locking its owner out', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-login-test-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		clearConfigCache();
		bootstrapAdmin('bootstrap', 'bootstrap', 'admin@example.com', 'Admin', 'a-long-password-123');

		for (let i = 0; i < 5; i++) expect(await attempt(`10.0.0.${i}`, 'wrong-password')).toBe(401);
		const started = Date.now();
		expect(await attempt('10.0.1.1', 'a-long-password-123')).toBe(200);
		expect(Date.now() - started).toBeGreaterThanOrEqual(900);
	}, 15_000);

	it('keeps parallel attempts from one address within its limit', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-login-test-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		clearConfigCache();
		bootstrapAdmin('bootstrap', 'bootstrap', 'admin@example.com', 'Admin', 'a-long-password-123');
		const statuses = await Promise.all(
			Array.from({ length: 20 }, () => attempt('10.5.5.5', 'wrong-password', 'pilot@example.com'))
		);
		expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(8);
		expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(12);
	}, 60_000);

	it('refuses parallel guesses on one account instead of queueing them', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-login-test-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		clearConfigCache();
		bootstrapAdmin('bootstrap', 'bootstrap', 'admin@example.com', 'Admin', 'a-long-password-123');
		// After three failures each attempt waits, which is when overlap is possible.
		for (let i = 0; i < 3; i++) await attempt(`10.6.0.${i}`, 'wrong-password', 'rso@example.com');
		const statuses = await Promise.all(
			[1, 2, 3, 4].map((i) => attempt(`10.6.1.${i}`, 'wrong-password', 'rso@example.com'))
		);
		expect(statuses.filter((status) => status === 401)).toHaveLength(1);
		expect(statuses.filter((status) => status === 429)).toHaveLength(3);
	}, 15_000);

	it('lets a known address skip the account throttle', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-login-test-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		clearConfigCache();
		bootstrapAdmin('bootstrap', 'bootstrap', 'admin@example.com', 'Admin', 'a-long-password-123');
		expect(await attempt('10.7.0.1', 'a-long-password-123')).toBe(200);
		for (let i = 0; i < 6; i++) await attempt(`10.7.1.${i}`, 'wrong-password');
		// The guessing above leaves this account several failures behind.
		const started = Date.now();
		expect(await attempt('10.7.0.1', 'a-long-password-123')).toBe(200);
		expect(Date.now() - started).toBeLessThan(500);
	}, 30_000);

	it('refuses an address after repeated failures', async () => {
		const root = mkdtempSync(join(tmpdir(), 'mcs-login-test-'));
		roots.push(root);
		process.env.MCS_CONFIG_DIR = join(root, 'config');
		clearConfigCache();
		bootstrapAdmin('bootstrap', 'bootstrap', 'admin@example.com', 'Admin', 'a-long-password-123');
		// Different emails keep the per-account delay out of this test.
		for (let i = 0; i < 8; i++) {
			const request = new Request('http://localhost/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: `nobody${i}@example.com`, password: 'x' })
			});
			await POST({
				request,
				url: new URL(request.url),
				cookies: { set: () => {} },
				getClientAddress: () => '10.9.9.9'
			} as unknown as Parameters<typeof POST>[0]);
		}
		expect(await attempt('10.9.9.9', 'a-long-password-123')).toBe(429);
	}, 15_000);
});
