import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleMcpMessage, type McpAccess } from '$lib/server/mcp.js';
import { MAX_JSON_BODY_BYTES } from '$lib/server/ingest-validation.js';
import { authenticationRequired } from '$lib/server/auth.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Web pages must not be able to drive this endpoint. A JSON content type
 * forces a CORS preflight that this server never answers, a foreign Origin is
 * refused outright, and without accounts only loopback Host names are accepted
 * so a DNS-rebinding page cannot pose as the local server.
 */
function rejectBrowserForgery(request: Request, url: URL): Response | null {
	const contentType = request.headers.get('content-type') ?? '';
	if (!/^application\/json\b/i.test(contentType)) {
		return json({ error: 'Content-Type must be application/json' }, { status: 415 });
	}
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) {
		return json({ error: 'Request origin is not allowed' }, { status: 403 });
	}
	// Read the Host header itself: url can come from a configured ORIGIN.
	const host = request.headers.get('host') ?? '';
	const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
	if (!authenticationRequired() && !LOOPBACK_HOSTS.has(hostname.toLowerCase())) {
		return json({ error: 'Without accounts, MCP accepts loopback hosts only' }, { status: 403 });
	}
	return null;
}

/**
 * MCP Streamable HTTP endpoint. The server is stateless and answers every
 * request with a JSON body, so it needs no session or server-sent stream.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
	const forged = rejectBrowserForgery(request, url);
	if (forged) return forged;
	const access: McpAccess = {
		user: locals.authUser ?? null,
		tokenProjectId: locals.serviceTokenProjectId ?? null
	};
	const text = await request.text();
	if (Buffer.byteLength(text) > MAX_JSON_BODY_BYTES) {
		return json(
			{ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } },
			{ status: 413 }
		);
	}
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return json(
			{ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
			{ status: 400 }
		);
	}
	const messages = Array.isArray(body) ? body : [body];
	const responses = messages
		.map((message) => handleMcpMessage(message, access))
		.filter((response) => response !== null);
	if (responses.length === 0) return new Response(null, { status: 202 });
	return json(Array.isArray(body) ? responses : responses[0], {
		headers: { 'Cache-Control': 'no-store' }
	});
};

// This server never pushes messages, so there is no event stream to open.
export const GET: RequestHandler = () =>
	new Response(null, { status: 405, headers: { Allow: 'POST' } });

export const DELETE: RequestHandler = () =>
	new Response(null, { status: 405, headers: { Allow: 'POST' } });
