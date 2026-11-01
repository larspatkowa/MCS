import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readManifest, writeManifest, getProjectPathById } from '$lib/server/project';
import type { ProjectManifest } from '$lib/server/project';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { deleteProjectById } from '$lib/server/project-delete';
import {
	readJsonObject,
	validateText,
	validateValueObject
} from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	try {
		const projectPath = getProjectPathById(id);
		if (!projectPath) return apiErrorResponse('Project not found', 404);
		const manifest = readManifest(projectPath);
		if (!manifest) return apiErrorResponse('Project not found', 404);
		return json({ path: projectPath, ...manifest });
	} catch (e) {
		console.error('[GET /api/projects/:id] Error:', e);
		return handleApiError(e, 'GET /api/projects/[id]');
	}
};

const PATCH_BODY_KEYS = ['name', 'notes', 'settings'] as const;

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const projectPath = getProjectPathById(id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const manifest = readManifest(projectPath);
	if (!manifest) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		const updates: Partial<ProjectManifest> = {};
		if (body.name !== undefined) {
			validateText(body.name, 'name', 200);
			if (!(body.name as string).trim()) return apiErrorResponse('name must not be empty', 400);
			updates.name = (body.name as string).trim();
		}
		if (body.notes !== undefined) {
			if (body.notes !== null) validateText(body.notes, 'notes');
			updates.notes = body.notes as string | undefined;
		}
		if (
			body.settings !== undefined &&
			typeof body.settings === 'object' &&
			body.settings !== null
		) {
			validateValueObject(body.settings, 'settings');
			const incoming = body.settings as Record<string, unknown>;
			const nextSettings: ProjectManifest['settings'] = { ...(manifest.settings ?? {}) };

			if (
				incoming.dateTime !== undefined &&
				typeof incoming.dateTime === 'object' &&
				incoming.dateTime !== null
			) {
				const existingDateTime = manifest.settings?.dateTime ?? {};
				const incomingDateTime = incoming.dateTime as Record<string, unknown>;
				nextSettings.dateTime = { ...existingDateTime, ...incomingDateTime };
			}
			if (incoming.telemetryRetentionDays !== undefined) {
				const days = incoming.telemetryRetentionDays;
				if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 3650) {
					return apiErrorResponse('telemetryRetentionDays must be an integer from 1 to 3650', 400);
				}
				nextSettings.telemetryRetentionDays = days;
			}

			updates.settings = nextSettings;
		}
		const merged: ProjectManifest = { ...manifest, ...updates };
		writeManifest(projectPath, merged);
		return json({ path: projectPath, ...merged });
	} catch (error) {
		return handleApiError(error, 'PATCH /api/projects/[id]');
	}
};

export const DELETE: RequestHandler = async ({ params, request }) => {
	let deleteFolder = false;
	try {
		const body = (await request.json()) as { deleteFolder?: boolean } | undefined;
		deleteFolder = body?.deleteFolder === true;
	} catch {
		// No body or invalid JSON: remove from list only
	}

	const outcome = deleteProjectById(params.id, deleteFolder);
	if (!outcome.ok) {
		return apiErrorResponse(outcome.error, outcome.statusCode);
	}
	return new Response(null, { status: 204 });
};
