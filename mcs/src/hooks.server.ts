import { logger } from '$lib/server/logger.js';
import { closeAllProjectDbs } from '$lib/server/db.js';
import {
	authenticationRequired,
	closeAuthDatabases,
	getProjectRole,
	projectForApiToken,
	recordAudit,
	resolveSession
} from '$lib/server/auth.js';
import { MAX_JSON_BODY_BYTES } from '$lib/server/ingest-validation.js';
import {
	startTelemetryRetentionCleanup,
	stopTelemetryRetentionCleanup
} from '$lib/server/retention.js';
import { guardRequest, withSecurityHeaders } from '$lib/server/request-guard.js';
import type { Handle } from '@sveltejs/kit';

/**
 * SvelteKit server hooks.
 *
 * Provides:
 * - Structured request/response logging for every API call
 * - Startup banner logged once on first request
 */

let started = false;
let shuttingDown = false;

function shutDown(reason: string): void {
	if (shuttingDown) return;
	shuttingDown = true;
	closeAllProjectDbs();
	closeAuthDatabases();
	stopTelemetryRetentionCleanup();
	logger.info('server', 'MCS server stopped', { reason });
}

if (process.env.NODE_ENV !== 'test') {
	// adapter-node emits this after it has stopped accepting requests. Releasing
	// MCS resources here preserves the adapter's own graceful shutdown window.
	process.once('sveltekit:shutdown', (reason) => shutDown(String(reason)));
}

export const handle: Handle = async (input) => {
	const refused = guardRequest(input.event.request, authenticationRequired());
	if (refused) return withSecurityHeaders(refused);
	return withSecurityHeaders(await handleRequest(input));
};

const handleRequest: Handle = async ({ event, resolve }) => {
	// Log startup once
	if (!started) {
		started = true;
		startTelemetryRetentionCleanup();
		logger.info('server', 'MCS server started', {
			nodeVersion: process.version,
			env: process.env.NODE_ENV ?? 'development'
		});
	}

	const { method, url } = event.request;
	const path = new URL(url).pathname;
	const isApi = path.startsWith('/api/');
	const authRequired = authenticationRequired();
	const sessionToken = event.cookies.get('mcs_session');
	const user = resolveSession(sessionToken);
	event.locals.authUser = user;
	event.locals.projectRole = null;
	event.locals.serviceTokenProjectId = null;

	if (authRequired && !isPublicAuthPath(path)) {
		const isBatchDelete = path === '/api/projects/batch-delete';
		if (isBatchDelete && user?.globalRole !== 'admin') {
			return jsonAuthError('Administrator access required', 403);
		}
		const projectId = isBatchDelete ? null : projectIdFromPath(path);
		const isIngest =
			path === '/api/ingest' || path === '/api/ingest/batch' || path === '/api/ingest/v2';
		if (isIngest) {
			const bearer = event.request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
			const bodyRead = await readBoundedProjectId(event.request);
			if (bodyRead.tooLarge) return jsonAuthError('Request body is too large', 413);
			const bodyProjectId = bodyRead.projectId;
			const tokenProjectId = projectForApiToken(bearer);
			if (!user && tokenProjectId && bodyProjectId === tokenProjectId) {
				event.locals.serviceTokenProjectId = tokenProjectId;
			} else if (!user) {
				return authFailure(isApi, path);
			}
			if (user && bodyProjectId) {
				const role = getProjectRole(user.id, bodyProjectId);
				event.locals.projectRole = role;
				if (!role) return jsonAuthError('Project access denied', 403);
				if (role === 'viewer' && isMutation(method))
					return jsonAuthError('Editor access required', 403);
			}
		}

		// MCP tools check project access per call, so a token only needs to be valid here.
		if (path === '/api/mcp' && !user) {
			const bearer = event.request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
			event.locals.serviceTokenProjectId = projectForApiToken(bearer);
		}

		if (!user && !event.locals.serviceTokenProjectId) return authFailure(isApi, path);
		if (user && projectId) {
			const role = getProjectRole(user.id, projectId);
			event.locals.projectRole = role;
			if (!role)
				return isApi
					? new Response(JSON.stringify({ error: 'Project access denied' }), {
							status: 403,
							headers: { 'Content-Type': 'application/json' }
						})
					: new Response(null, { status: 303, headers: { Location: '/project-access' } });
			if (isMutation(method) && role === 'viewer')
				return jsonAuthError('Editor access required', 403);
			if (
				method === 'DELETE' &&
				path === `/api/projects/${encodeURIComponent(projectId)}` &&
				role !== 'admin'
			) {
				return jsonAuthError('Project administrator access required', 403);
			}
		}
		if (path.startsWith('/api/admin/') && user?.globalRole !== 'admin') {
			return new Response(JSON.stringify({ error: 'Administrator access required' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		if (path === '/api/projects' && !user) return authFailure(true, path);
		if (isMutation(method) && user && !isSafeOrigin(event.request.headers.get('origin'), url)) {
			return new Response(JSON.stringify({ error: 'Request origin is not allowed' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	// Only log API calls — skip static assets and page navigations
	if (isApi) {
		const start = Date.now();
		let status = 200;
		try {
			const response = await resolve(event);
			status = response.status;
			if (authRequired && status < 400 && isMutation(method) && !path.startsWith('/api/auth/')) {
				recordAudit(
					event.locals.authUser?.id ?? null,
					`${method.toLowerCase()} ${path}`,
					projectIdFromPath(path) ?? event.locals.serviceTokenProjectId ?? undefined
				);
			}
			const ms = Date.now() - start;
			const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
			logger[level]('http', `${method} ${path} ${status}`, { method, path, status, ms });
			return response;
		} catch (err) {
			const ms = Date.now() - start;
			logger.exception('http', `${method} ${path} unhandled`, err, { method, path, ms });
			throw err;
		}
	}

	return resolve(event);
};

function isPublicAuthPath(path: string): boolean {
	return (
		path === '/api/health' ||
		path === '/api/health/ready' ||
		path.startsWith('/api/auth/') ||
		path === '/login' ||
		path.startsWith('/_app/') ||
		path.startsWith('/assets/') ||
		path.startsWith('/fonts/') ||
		path.startsWith('/branding/') ||
		path === '/favicon.png' ||
		path === '/sw.js'
	);
}

function projectIdFromPath(path: string): string | null {
	const match = /^\/(?:api\/projects|project|render)\/([^/]+)(?:\/|$)/.exec(path);
	return match ? decodeURIComponent(match[1]) : null;
}

function isMutation(method: string): boolean {
	return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function isSafeOrigin(origin: string | null, requestUrl: string): boolean {
	if (!origin) return false;
	try {
		return new URL(origin).origin === new URL(requestUrl).origin;
	} catch {
		return false;
	}
}

function authFailure(isApi: boolean, path: string): Response {
	if (isApi) {
		return new Response(JSON.stringify({ error: 'Authentication required' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	}
	if (path === '/login') return new Response(null, { status: 401 });
	return new Response(null, { status: 303, headers: { Location: '/login' } });
}

function jsonAuthError(message: string, status: number): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}

async function readBoundedProjectId(
	request: Request
): Promise<{ projectId: string | null; tooLarge: boolean }> {
	const contentLength = request.headers.get('content-length');
	if (contentLength !== null) {
		const parsed = Number(contentLength);
		if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_JSON_BODY_BYTES) {
			return { projectId: null, tooLarge: true };
		}
	}
	const reader = request.clone().body?.getReader();
	if (!reader) return { projectId: null, tooLarge: false };
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			totalBytes += value.byteLength;
			if (totalBytes > MAX_JSON_BODY_BYTES) {
				await reader.cancel();
				return { projectId: null, tooLarge: true };
			}
			chunks.push(value);
		}
	} catch {
		return { projectId: null, tooLarge: false };
	}
	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		const body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
		if (!body || typeof body !== 'object' || Array.isArray(body))
			return { projectId: null, tooLarge: false };
		const projectId = (body as Record<string, unknown>).projectId;
		return { projectId: typeof projectId === 'string' ? projectId : null, tooLarge: false };
	} catch {
		return { projectId: null, tooLarge: false };
	}
}
