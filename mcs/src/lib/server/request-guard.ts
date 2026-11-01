/**
 * Browser-forgery defenses applied to every request before routing.
 *
 * - DNS rebinding: without accounts, the Host header must be a loopback name,
 *   an IP literal, or a name listed in MCS_ALLOWED_HOSTS. A rebinding attack
 *   needs the attacker's own domain in Host, so this stops it from reading or
 *   writing the local server.
 * - Cross-site writes: a write whose Origin or Sec-Fetch-Site shows another
 *   site is refused, whatever its content type.
 * - Simple requests: a write body must be JSON or multipart. Other types
 *   (including none) are the ones a page can send cross-site without a CORS
 *   preflight.
 */
import { isIP } from 'node:net';

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const WRITE_BODY_TYPES = /^(application\/json|multipart\/form-data)\b/i;

function configuredHosts(): Set<string> {
	return new Set(
		(process.env.MCS_ALLOWED_HOSTS ?? '')
			.split(',')
			.map((host) => host.trim().toLowerCase())
			.filter(Boolean)
	);
}

/** Host header without the port, lower-cased; IPv6 keeps its brackets. */
export function hostnameOf(host: string): string {
	const value = host.trim().toLowerCase();
	if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
	return value.split(':')[0];
}

export function isAllowedHost(host: string): boolean {
	const name = hostnameOf(host);
	if (!name) return false;
	if (LOOPBACK_NAMES.has(name) || name.endsWith('.localhost')) return true;
	if (isIP(name.replace(/^\[|\]$/g, ''))) return true;
	return configuredHosts().has(name);
}

function isWrite(method: string): boolean {
	return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function hasBody(request: Request): boolean {
	const length = request.headers.get('content-length');
	if (length !== null) return Number(length) > 0;
	return request.headers.has('transfer-encoding') || request.body !== null;
}

function reject(status: number, error: string): Response {
	return new Response(JSON.stringify({ error }), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

export function guardRequest(request: Request, authRequired: boolean): Response | null {
	const url = new URL(request.url);
	const host = request.headers.get('host') ?? url.host;

	if (!authRequired && !isAllowedHost(host)) {
		return reject(
			421,
			`Host "${hostnameOf(host)}" is not allowed. Without accounts MCS answers only loopback names and IP addresses; add trusted names to MCS_ALLOWED_HOSTS.`
		);
	}

	if (!isWrite(request.method)) return null;

	const origin = request.headers.get('origin');
	if (origin && origin !== 'null') {
		let originHost = '';
		try {
			originHost = new URL(origin).host.toLowerCase();
		} catch {
			return reject(403, 'Request origin is not allowed');
		}
		if (originHost !== host.toLowerCase()) return reject(403, 'Request origin is not allowed');
	} else if (origin === 'null') {
		// Sandboxed frames and some redirects send an opaque origin.
		return reject(403, 'Request origin is not allowed');
	}
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		return reject(403, 'Cross-site requests are not allowed');
	}

	if (hasBody(request) && !WRITE_BODY_TYPES.test(request.headers.get('content-type') ?? '')) {
		return reject(415, 'Request body must be application/json or multipart/form-data');
	}
	return null;
}

const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'same-origin',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

/** Adds headers a route has not set itself. */
export function withSecurityHeaders(response: Response): Response {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!response.headers.has(name)) {
			try {
				response.headers.set(name, value);
			} catch {
				// Some responses (for example fetch passthroughs) have immutable headers.
				return response;
			}
		}
	}
	return response;
}
