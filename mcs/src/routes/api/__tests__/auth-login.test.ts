import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST } from '../auth/login/+server.js';
import { bootstrapAdmin, closeAuthDatabases } from '$lib/server/auth.js';
import { clearConfigCache } from '$lib/server/config.js';

const roots: string[] = [];

async function attempt(address: string, password: string): Promise<number> {
	const request = new Request('http://localhost/api/auth/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: 'admin@example.com', password })
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
