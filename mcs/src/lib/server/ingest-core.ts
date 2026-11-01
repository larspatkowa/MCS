import { getProjectPathById } from '$lib/server/project.js';
import * as streamsDb from '$lib/server/streams-db.js';
import * as limitsDb from '$lib/server/limits-db.js';
import * as runsDb from '$lib/server/runs-db.js';
import { broadcastStreamEvent, broadcastLimitEvent } from '$lib/server/stream-events.js';
import { logger } from '$lib/server/logger.js';
import { BadRequestError, ConflictError } from '$lib/server/errors.js';
import {
	MAX_BATCH_SIZE,
	validateSample,
	validateIdentifier
} from '$lib/server/ingest-validation.js';

function emitLimitEvents(
	projectId: string,
	projectPath: string,
	streamId: string,
	timestamp: number,
	values: Record<string, unknown>,
	runId: string | undefined,
	configs = limitsDb.getLimitConfigs(projectPath, streamId)
): void {
	if (configs.length === 0) return;
	for (const [field, rawVal] of Object.entries(values)) {
		if (typeof rawVal !== 'number') continue;
		const severity = limitsDb.evaluateLimits(configs, field, rawVal);
		if (
			!severity ||
			!limitsDb.shouldEmitLimitEvent(projectPath, streamId, field, severity, timestamp)
		)
			continue;

		const label = `${streamId}/${field} [${severity === 'red' ? 'CRIT' : 'WARN'}] ${rawVal.toFixed(3)}`;
		const event = limitsDb.createLimitEvent(projectPath, {
			streamId,
			field,
			ts: timestamp,
			value: rawVal,
			severity,
			label,
			runId
		});
		if (runId) {
			runsDb.recordHealthMetric(projectPath, runId, timestamp, 'limit_event', rawVal, {
				streamId,
				field,
				severity,
				label
			});
		}
		broadcastLimitEvent(projectId, event);
	}
}

/**
 * Single write path for stream ingestion: resolve project, write to DB, broadcast SSE.
 * Also evaluates configured limits and emits limit events when thresholds are crossed.
 * Used by REST ingest and batch ingest from external acquisition adapters.
 */
export function performIngest(
	projectId: string,
	streamId: string,
	timestamp: number,
	values: Record<string, unknown>
): void {
	// Keep this guard at the core boundary as well as at HTTP routes: adapters
	// and tests can call the ingest service without going through SvelteKit.
	const validated = validateSample({ streamId, timestamp, values });
	streamId = validated.streamId;
	timestamp = validated.timestamp;
	values = validated.values;
	const projectPath = getProjectPathById(projectId);
	if (!projectPath) {
		logger.warn('ingest', 'Project not found during ingest', { projectId, streamId });
		throw new Error('Project not found');
	}
	try {
		// The existing ingest payload remains the compatibility contract. When a
		// run is recording, this server-side gate associates the same payload with
		// that run; preview-only ingest has no durable run write.
		const activeRun = runsDb.getActiveRun(projectPath);
		const recordingRunId = activeRun?.status === 'recording' ? activeRun.id : undefined;
		const samples: streamsDb.IngestSample[] = [{ streamId, timestamp, values }];
		const acceptedSamples = streamsDb.ingestSamples(projectPath, samples, {
			runId: recordingRunId
		});
		const configsByStream = new Map<string, limitsDb.LimitConfig[]>();
		for (const sample of acceptedSamples) {
			let configs = configsByStream.get(sample.streamId);
			if (!configs) {
				configs = limitsDb.getLimitConfigs(projectPath, sample.streamId);
				configsByStream.set(sample.streamId, configs);
			}
			broadcastStreamEvent(
				projectId,
				sample.streamId,
				sample.timestamp,
				sample.values,
				sample.historyId,
				sample.telemetry?.sourceId ?? 'legacy'
			);
			emitLimitEvents(
				projectId,
				projectPath,
				sample.streamId,
				sample.timestamp,
				sample.values,
				recordingRunId,
				configs
			);
		}
		logger.debug('ingest', 'sample ingested', { projectId, streamId, timestamp });
	} catch (e) {
		logger.exception('ingest', 'Failed to ingest sample', e, { projectId, streamId, timestamp });
		throw e;
	}
}

/** Batch ingest path used by acquisition clients. The database write is one transaction. */
export function performIngestBatch(
	projectId: string,
	samples: streamsDb.IngestSample[],
	requestedRunId?: string
): string | null {
	return performIngestBatchDetailed(projectId, samples, requestedRunId).runId;
}

export function performIngestBatchDetailed(
	projectId: string,
	samples: streamsDb.IngestSample[],
	requestedRunId?: string
): { runId: string | null; acceptedCount: number; acceptedIds: string[] } {
	if (samples.length === 0) return { runId: null, acceptedCount: 0, acceptedIds: [] };
	if (samples.length > MAX_BATCH_SIZE) {
		throw new BadRequestError(`samples may contain at most ${MAX_BATCH_SIZE} items`);
	}
	samples = samples.map((sample) => {
		const validated = validateSample(sample);
		return { ...sample, ...validated };
	});
	if (requestedRunId !== undefined) requestedRunId = validateIdentifier(requestedRunId, 'runId');
	const projectPath = getProjectPathById(projectId);
	if (!projectPath) {
		logger.warn('ingest', 'Project not found during batch ingest', { projectId });
		throw new Error('Project not found');
	}
	try {
		const activeRun = runsDb.getActiveRun(projectPath);
		const recordingRunId = activeRun?.status === 'recording' ? activeRun.id : undefined;
		if (requestedRunId !== undefined && requestedRunId !== recordingRunId) {
			throw new ConflictError('runId must identify the active recording run');
		}
		const ingestion = streamsDb.ingestSamplesDetailed(projectPath, samples, {
			runId: recordingRunId
		});
		const records = ingestion.inserted;
		// Resolve limit configuration once per stream, not once per sample. This
		// keeps the high-rate path from doing a synchronous SQLite read for every
		// sample while preserving the same limit semantics.
		const configsByStream = new Map<string, limitsDb.LimitConfig[]>();
		for (const sample of records) {
			let configs = configsByStream.get(sample.streamId);
			if (!configs) {
				configs = limitsDb.getLimitConfigs(projectPath, sample.streamId);
				configsByStream.set(sample.streamId, configs);
			}
			broadcastStreamEvent(
				projectId,
				sample.streamId,
				sample.timestamp,
				sample.values,
				sample.historyId,
				sample.telemetry?.sourceId ?? 'legacy'
			);
			emitLimitEvents(
				projectId,
				projectPath,
				sample.streamId,
				sample.timestamp,
				sample.values,
				recordingRunId,
				configs
			);
		}
		return {
			runId: recordingRunId ?? null,
			acceptedCount: records.length,
			acceptedIds: ingestion.acknowledgedIds
		};
	} catch (e) {
		logger.exception('ingest', 'Failed to ingest batch', e, {
			projectId,
			count: samples.length
		});
		throw e;
	}
}
