import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as objectsDb from '$lib/server/objects-db';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { canContainChildren, type ObjectType } from '$lib/objects';
import { getDefaultPropsForType } from '$lib/objects/default-props';
import { getType } from '$lib/object-types/registry';
import {
	readJsonObject,
	validateIdentifier,
	validateText,
	validateValueObject
} from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const tree = objectsDb.getObjectTree(projectPath);
	if (!tree) return apiErrorResponse('Object tree not found', 404);
	return json(tree);
};

const TYPE_LABELS: Record<string, string> = {
	'flex-layout': 'Flex Layout',
	'grid-layout': 'Grid Layout',
	folder: 'Folder',
	gauge: 'Gauge',
	'telemetry-table': 'Telemetry Table',
	'line-plot': 'Line Plot',
	'video-stream': 'Video Stream',
	image: 'Image',
	'markdown-note': 'Markdown Note'
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const body = await readJsonObject(request);
		const { type, parentId, name, notes, props } = body as {
			type: string;
			parentId: string;
			name?: string;
			notes?: string;
			props?: Record<string, unknown>;
		};
		if (!type || !parentId) return apiErrorResponse('type and parentId required', 400);
		const validParentId = validateIdentifier(parentId, 'parentId');
		if (!getType(type) && !TYPE_LABELS[type]) {
			return apiErrorResponse(
				`Unknown object type: ${type}. Valid types: ${Object.keys(TYPE_LABELS).join(', ')}`,
				400
			);
		}
		const parent = objectsDb.getObject(projectPath, validParentId);
		if (!parent) return apiErrorResponse('Parent object not found', 404);
		if (!canContainChildren(parent.type as ObjectType)) {
			return apiErrorResponse(
				'Only folders, layout objects (flex/grid/tab), and project root can contain objects',
				400
			);
		}
		if (name !== undefined) validateText(name, 'name', 200);
		if (notes !== undefined) validateText(notes, 'notes');
		if (props !== undefined) validateValueObject(props, 'props');
		const nameStr = name?.trim() || TYPE_LABELS[type] || 'Object';
		const defaults = getDefaultPropsForType(type as ObjectType);
		const mergedProps = { ...defaults, ...props };
		const obj = objectsDb.createObject(projectPath, {
			type,
			parentId: validParentId,
			name: nameStr,
			notes,
			props: mergedProps
		});
		return json(obj);
	} catch (e) {
		return handleApiError(e, 'POST /api/projects/[id]/objects');
	}
};
