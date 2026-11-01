import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import * as limitsDb from '$lib/server/limits-db';
import { apiErrorResponse, BadRequestError, handleApiError } from '$lib/server/errors';
import {
	readJsonObject,
	validateIdentifier,
	validateText,
	validateValueObject
} from '$lib/server/ingest-validation.js';

interface FieldLimitDeclaration {
	field: string;
	yellowLow?: number | null;
	yellowHigh?: number | null;
	redLow?: number | null;
	redHigh?: number | null;
	unit?: string;
	min?: number;
	max?: number;
}

interface StreamDeclaration {
	id: string;
	name?: string;
	metadata?: Record<string, unknown>;
	/** Per-field limit thresholds to set/update for this stream. */
	fields?: FieldLimitDeclaration[];
}

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		const { streams } = body as { streams: StreamDeclaration[] };
		if (!Array.isArray(streams)) return apiErrorResponse('streams array required', 400);
		if (streams.length > 500) return apiErrorResponse('Too many streams in declaration', 400);
		let count = 0;
		for (const s of streams) {
			if (!s || typeof s !== 'object')
				throw new BadRequestError('Each stream declaration must be an object');
			const stream = s as StreamDeclaration;
			const streamId = validateIdentifier(stream.id, 'stream id');
			if (stream.name !== undefined) validateText(stream.name, 'stream name', 200);
			if (stream.metadata !== undefined) validateValueObject(stream.metadata, 'metadata');
			// Merge field metadata (unit, min, max) into stream metadata blob
			const meta: Record<string, unknown> = { ...(stream.metadata ?? {}) };
			if (stream.fields !== undefined && !Array.isArray(stream.fields)) {
				throw new BadRequestError('fields must be an array');
			}
			if (Array.isArray(stream.fields) && stream.fields.length > 256) {
				throw new BadRequestError('Too many fields in stream declaration');
			}
			if (Array.isArray(stream.fields) && stream.fields.length > 0) {
				const fieldsMeta: Record<string, unknown> = {};
				for (const f of stream.fields) {
					if (!f || typeof f !== 'object')
						throw new BadRequestError('Each field declaration must be an object');
					const field = f as FieldLimitDeclaration;
					const fieldName = validateIdentifier(field.field, 'field');
					if (field.unit !== undefined) validateText(field.unit, 'unit', 200);
					for (const key of [
						'min',
						'max',
						'yellowLow',
						'yellowHigh',
						'redLow',
						'redHigh'
					] as const) {
						const value = field[key];
						if (
							value !== undefined &&
							value !== null &&
							(typeof value !== 'number' || !Number.isFinite(value))
						) {
							throw new BadRequestError(`${key} must be a finite number or null`);
						}
					}
					const entry: Record<string, unknown> = {};
					if (field.unit != null) entry.unit = field.unit;
					if (field.min != null) entry.min = field.min;
					if (field.max != null) entry.max = field.max;
					fieldsMeta[fieldName] = entry;
					// Apply limit thresholds if any threshold is specified
					const hasThreshold =
						field.yellowLow != null ||
						field.yellowHigh != null ||
						field.redLow != null ||
						field.redHigh != null;
					if (hasThreshold) {
						limitsDb.setLimitConfig(projectPath, streamId, fieldName, {
							yellowLow: field.yellowLow ?? null,
							yellowHigh: field.yellowHigh ?? null,
							redLow: field.redLow ?? null,
							redHigh: field.redHigh ?? null,
							enabled: true
						});
					}
				}
				meta._fields = fieldsMeta;
			}
			streamsDb.updateStreamMetadata(projectPath, streamId, meta, stream.name);
			count++;
		}
		return json({ ok: true, count });
	} catch (e) {
		return handleApiError(e, 'POST /api/projects/[id]/streams/declare');
	}
};
