import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { authenticationRequired, hasUsers } from '$lib/server/auth.js';
import { loadConfig } from '$lib/server/config.js';
import { getDb, projectDbExists } from '$lib/server/db.js';
import { readManifest } from '$lib/server/project.js';

export const GET: RequestHandler = () => {
	const configuredPaths = [...new Set(loadConfig().recentProjectPaths)];
	let availableProjects = 0;
	let unavailableProjects = 0;
	let freshSources = 0;
	let staleSources = 0;
	let emptySources = 0;
	for (const projectPath of configuredPaths) {
		if (!readManifest(projectPath) || !projectDbExists(projectPath)) {
			unavailableProjects += 1;
			continue;
		}
		try {
			const db = getDb(projectPath);
			db.prepare('SELECT 1').get();
			availableProjects += 1;
			const sources = db
				.prepare('SELECT last_received_at,expected_period_ms FROM telemetry_sources')
				.all() as {
				last_received_at: number | null;
				expected_period_ms: number | null;
			}[];
			for (const source of sources) {
				if (source.last_received_at === null) emptySources += 1;
				else if (
					(Date.now() / 1000 - source.last_received_at) * 1000 >
					Math.max(10_000, (source.expected_period_ms ?? 0) * 3)
				)
					staleSources += 1;
				else freshSources += 1;
			}
		} catch {
			unavailableProjects += 1;
		}
	}
	const authReady = !authenticationRequired() || hasUsers();
	const ready = unavailableProjects === 0 && authReady;
	return json(
		{
			ready,
			status: ready ? 'ready' : 'degraded',
			uptimeSeconds: Math.floor(process.uptime()),
			projects: {
				configured: configuredPaths.length,
				available: availableProjects,
				unavailable: unavailableProjects
			},
			sources: { fresh: freshSources, stale: staleSources, empty: emptySources },
			authentication: { required: authenticationRequired(), configured: authReady }
		},
		{ status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
	);
};
