import { getProjectPathById } from '$lib/server/project.js';
import * as streamsDb from '$lib/server/streams-db.js';
import * as limitsDb from '$lib/server/limits-db.js';
import { broadcastStreamEvent, broadcastLimitEvent } from '$lib/server/stream-events.js';
import { logger } from '$lib/server/logger.js';

/**
 * Single write path for stream ingestion: resolve project, write to DB, broadcast SSE.
 * Also evaluates configured limits and emits limit events when thresholds are crossed.
 * Used by REST ingest, batch ingest, and in-process plugins.
 */
export function performIngest(
	projectId: string,
	streamId: string,
	timestamp: number,
	values: Record<string, unknown>
): void {
	const projectPath = getProjectPathById(projectId);
	if (!projectPath) {
		logger.warn('ingest', 'Project not found during ingest', { projectId, streamId });
		throw new Error('Project not found');
	}
	try {
		streamsDb.ingestSample(projectPath, streamId, timestamp, values);
		broadcastStreamEvent(projectId, streamId, timestamp, values);
		logger.debug('ingest', 'sample ingested', { projectId, streamId, timestamp });

		// Evaluate limits for each numeric field in the payload
		const configs = limitsDb.getLimitConfigs(projectPath, streamId);
		if (configs.length > 0) {
			for (const [field, rawVal] of Object.entries(values)) {
				if (typeof rawVal !== 'number') continue;
				const value = rawVal as number;
				const severity = limitsDb.evaluateLimits(configs, field, value);
				if (!severity) continue;
				if (!limitsDb.shouldEmitLimitEvent(projectPath, streamId, field, severity, timestamp))
					continue;

				const label = `${streamId}/${field} [${severity === 'red' ? 'CRIT' : 'WARN'}] ${value.toFixed(3)}`;
				const event = limitsDb.createLimitEvent(projectPath, {
					streamId,
					field,
					ts: timestamp,
					value,
					severity,
					label
				});
				broadcastLimitEvent(projectId, event);
				logger.debug('ingest', 'limit event emitted', {
					projectId,
					streamId,
					field,
					severity,
					value
				});
			}
		}
	} catch (e) {
		logger.exception('ingest', 'Failed to ingest sample', e, { projectId, streamId, timestamp });
		throw e;
	}
}
