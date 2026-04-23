import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as streamsDb from '$lib/server/streams-db';
import * as limitsDb from '$lib/server/limits-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';

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
	const body = await request.json();
	const { streams } = body as { streams: StreamDeclaration[] };
	if (!Array.isArray(streams)) return apiErrorResponse('streams array required', 400);
	try {
		let count = 0;
		for (const s of streams) {
			if (!s?.id) continue;
			// Merge field metadata (unit, min, max) into stream metadata blob
			const meta: Record<string, unknown> = { ...(s.metadata ?? {}) };
			if (Array.isArray(s.fields) && s.fields.length > 0) {
				const fieldsMeta: Record<string, unknown> = {};
				for (const f of s.fields) {
					if (!f?.field) continue;
					const entry: Record<string, unknown> = {};
					if (f.unit != null) entry.unit = f.unit;
					if (f.min != null) entry.min = f.min;
					if (f.max != null) entry.max = f.max;
					fieldsMeta[f.field] = entry;
					// Apply limit thresholds if any threshold is specified
					const hasThreshold =
						f.yellowLow != null || f.yellowHigh != null || f.redLow != null || f.redHigh != null;
					if (hasThreshold) {
						limitsDb.setLimitConfig(projectPath, s.id, f.field, {
							yellowLow: f.yellowLow ?? null,
							yellowHigh: f.yellowHigh ?? null,
							redLow: f.redLow ?? null,
							redHigh: f.redHigh ?? null,
							enabled: true
						});
					}
				}
				meta._fields = fieldsMeta;
			}
			streamsDb.updateStreamMetadata(projectPath, s.id, meta, s.name);
			count++;
		}
		return json({ ok: true, count });
	} catch (e) {
		return handleApiError(e, 'POST /api/projects/[id]/streams/declare');
	}
};
