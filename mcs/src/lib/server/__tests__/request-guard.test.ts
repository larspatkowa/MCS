import { afterEach, describe, expect, it } from 'vitest';
import { guardRequest, hostnameOf, isAllowedHost } from '../request-guard.js';

function request(
	method: string,
	headers: Record<string, string> = {},
	body?: string,
	url = 'http://localhost:5173/api/ingest'
) {
	return new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
}

afterEach(() => {
	delete process.env.MCS_ALLOWED_HOSTS;
});

describe('request guard', () => {
	it('accepts loopback names and IP literals, and rejects other names without accounts', () => {
		expect(hostnameOf('[::1]:5173')).toBe('[::1]');
		for (const host of [
			'localhost:5173',
			'127.0.0.1',
			'[::1]:80',
			'gs.localhost',
			'192.168.1.20:5173'
		])
			expect(isAllowedHost(host), host).toBe(true);
		expect(isAllowedHost('evil.example:5173')).toBe(false);
		process.env.MCS_ALLOWED_HOSTS = 'groundstation.lan';
		expect(isAllowedHost('GroundStation.lan:5173')).toBe(true);

		const rebound = request('GET', { host: 'evil.example:5173' });
		expect(guardRequest(rebound, false)?.status).toBe(421);
		// With accounts, browser cookies never reach a rebound name.
		expect(guardRequest(rebound, true)).toBeNull();
	});

	it('refuses cross-site writes', () => {
		const json = { 'content-type': 'application/json' };
		expect(
			guardRequest(request('POST', { ...json, origin: 'https://evil.example' }, '{}'), false)
				?.status
		).toBe(403);
		expect(guardRequest(request('POST', { ...json, origin: 'null' }, '{}'), false)?.status).toBe(
			403
		);
		expect(guardRequest(request('DELETE', { 'sec-fetch-site': 'cross-site' }), false)?.status).toBe(
			403
		);
		expect(
			guardRequest(request('POST', { ...json, origin: 'http://localhost:5173' }, '{}'), false)
		).toBeNull();
	});

	it('requires a JSON or multipart body on writes', () => {
		expect(guardRequest(request('POST', {}, '{"a":1}'), false)?.status).toBe(415);
		expect(
			guardRequest(request('POST', { 'content-type': 'text/plain' }, '{}'), false)?.status
		).toBe(415);
		expect(
			guardRequest(
				request('POST', { 'content-type': 'application/json; charset=utf-8' }, '{}'),
				false
			)
		).toBeNull();
		expect(guardRequest(request('PATCH'), false)).toBeNull();
		expect(guardRequest(request('GET'), false)).toBeNull();
	});
});
