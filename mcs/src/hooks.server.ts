import { logger } from '$lib/server/logger.js';
import { ensureFirstRunDemoProject } from '$lib/server/first-run.js';
import type { Handle } from '@sveltejs/kit';

/**
 * SvelteKit server hooks.
 *
 * Provides:
 * - Structured request/response logging for every API call
 * - Startup banner logged once on first request
 */

let started = false;

export const handle: Handle = async ({ event, resolve }) => {
	// Static demo builds prerender routes at build time; we must not touch the on-disk project store / SQLite.
	if (process.env.MCS_DEMO === 'agri-static') {
		return resolve(event);
	}

	// Log startup once
	if (!started) {
		started = true;
		ensureFirstRunDemoProject();
		logger.info('server', 'MCS server started', {
			nodeVersion: process.version,
			env: process.env.NODE_ENV ?? 'development'
		});
	}

	const { method, url } = event.request;
	const path = new URL(url).pathname;
	const isApi = path.startsWith('/api/');

	// Only log API calls — skip static assets and page navigations
	if (isApi) {
		const start = Date.now();
		let status = 200;
		try {
			const response = await resolve(event);
			status = response.status;
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
