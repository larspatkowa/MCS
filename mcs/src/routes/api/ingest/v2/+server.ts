import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { performIngestBatchDetailed } from '$lib/server/ingest-core.js';
import { getProjectPathById } from '$lib/server/project.js';
import { ensureSource, getSource, getSourceClock } from '$lib/server/sources-db.js';
import { normalizeSourceTime, sourceTimeAdapterFor } from '$lib/server/clock-normalization.js';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors.js';
import { readJsonObject, validateTelemetryEnvelope } from '$lib/server/ingest-validation.js';
import type { IngestSample } from '$lib/server/streams-db.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const envelope = validateTelemetryEnvelope(await readJsonObject(request));
		if (envelope.source.id === 'legacy')
			throw new BadRequestError('source.id "legacy" is reserved');
		const projectPath = getProjectPathById(envelope.projectId);
		if (!projectPath) return apiErrorResponse('Project not found', 404);
		const existingSource = getSource(projectPath, envelope.source.id);
		const clock = existingSource
			? getSourceClock(projectPath, envelope.source.id)
			: {
					timeSystem: envelope.source.timeSystem,
					timestampUnit: envelope.source.timestampUnit,
					offsetSeconds: 0,
					driftPpm: 0,
					referenceSourceSeconds: 0
				};
		const samples: IngestSample[] = envelope.samples.map((sample, index) => {
			let normalized;
			try {
				const adapter = sourceTimeAdapterFor(sample.sourceTimestamp.timeSystem);
				normalized = normalizeSourceTime(
					sample.sourceTimestamp.value,
					sample.sourceTimestamp.unit,
					{
						...clock,
						timeSystem: sample.sourceTimestamp.timeSystem,
						...(adapter ? { adapter } : {})
					}
				);
			} catch (error) {
				throw new BadRequestError(
					`samples[${index}].sourceTimestamp: ${error instanceof Error ? error.message : 'invalid source time'}`
				);
			}
			const inputQuality = sample.quality ?? {};
			const inputProvenance = sample.provenance ?? {};
			return {
				streamId: sample.streamId,
				timestamp: normalized.eventTimeUtc,
				values: sample.values,
				telemetry: {
					sourceId: envelope.source.id,
					sourceName: envelope.source.name,
					sourceTimestamp: normalized.sourceTimestamp,
					sourceUnit: normalized.sourceTimestampUnit,
					sourceTimeSystem: normalized.timeSystem,
					...(sample.sequence === undefined ? {} : { sequence: sample.sequence }),
					...(sample.idempotencyKey === undefined ? {} : { idempotencyKey: sample.idempotencyKey }),
					quality: {
						...inputQuality,
						clock:
							inputQuality.clock ?? inputQuality.clockQuality ?? normalized.quality.clockQuality,
						clockUncertaintySeconds:
							inputQuality.clockUncertaintySeconds ?? normalized.quality.uncertaintySeconds
					},
					provenance: {
						...inputProvenance,
						normalization: normalized.quality.provenance
					}
				}
			};
		});
		// Do not create source metadata until the whole batch has passed clock
		// conversion; malformed source clocks must not leave ghost sources behind.
		ensureSource(
			projectPath,
			envelope.source.id,
			envelope.source.name,
			envelope.source.timeSystem,
			envelope.source.timestampUnit
		);
		const result = performIngestBatchDetailed(envelope.projectId, samples);
		return json({
			ok: true,
			received: samples.length,
			accepted: result.acceptedCount,
			acceptedIds: result.acceptedIds,
			runId: result.runId
		});
	} catch (error) {
		if (error instanceof Error && error.message === 'Project not found')
			return apiErrorResponse('Project not found', 404);
		return handleApiError(error, 'POST /api/ingest/v2');
	}
};
