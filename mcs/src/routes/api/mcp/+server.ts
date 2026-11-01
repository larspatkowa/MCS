import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleMcpMessage, type McpAccess } from '$lib/server/mcp.js';
import { MAX_JSON_BODY_BYTES } from '$lib/server/ingest-validation.js';

/**
 * MCP Streamable HTTP endpoint. The server is stateless and answers every
 * request with a JSON body, so it needs no session or server-sent stream.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
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
