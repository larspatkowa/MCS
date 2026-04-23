import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readManifest, writeManifest, getProjectPathById } from '$lib/server/project';
import type { ProjectManifest } from '$lib/server/project';
import { parseTutorialExampleKind } from '$lib/tutorial-kinds.js';
import { apiErrorResponse } from '$lib/server/errors';
import { deleteProjectById } from '$lib/server/project-delete';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	try {
		const projectPath = getProjectPathById(id);
		if (!projectPath) return apiErrorResponse('Project not found', 404);
		const manifest = readManifest(projectPath);
		if (!manifest) return apiErrorResponse('Project not found', 404);
		return json({ path: projectPath, ...manifest });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		console.error('[GET /api/projects/:id] Error:', e);
		if (e instanceof Error && e.stack) console.error('Stack:', e.stack);
		return apiErrorResponse(message, 500);
	}
};

const PATCH_BODY_KEYS = ['name', 'notes', 'settings'] as const;

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const projectPath = getProjectPathById(id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const manifest = readManifest(projectPath);
	if (!manifest) return apiErrorResponse('Project not found', 404);
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return apiErrorResponse('Invalid JSON body', 400);
	}
	const updates: Partial<ProjectManifest> = {};
	if (typeof body.name === 'string') updates.name = body.name;
	if (body.notes !== undefined) updates.notes = body.notes as string | undefined;
	if (body.settings !== undefined && typeof body.settings === 'object' && body.settings !== null) {
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

		if (incoming.autoStartPlugins !== undefined) {
			nextSettings.autoStartPlugins = Array.isArray(incoming.autoStartPlugins)
				? incoming.autoStartPlugins
						.filter((value): value is string => typeof value === 'string')
						.filter((value, index, arr) => arr.indexOf(value) === index)
				: [];
		}

		if (incoming.tutorialExampleKind !== undefined) {
			if (incoming.tutorialExampleKind === null) {
				delete nextSettings.tutorialExampleKind;
			} else {
				const parsed = parseTutorialExampleKind(incoming.tutorialExampleKind);
				if (parsed) nextSettings.tutorialExampleKind = parsed;
			}
		}

		updates.settings = nextSettings;
	}
	const merged: ProjectManifest = { ...manifest, ...updates };
	writeManifest(projectPath, merged);
	return json({ path: projectPath, ...merged });
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
