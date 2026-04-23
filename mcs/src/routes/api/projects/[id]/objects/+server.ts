import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as objectsDb from '$lib/server/objects-db';
import * as projectChanges from '$lib/server/project-changes';
import { apiErrorResponse, handleApiError } from '$lib/server/errors';
import { canContainChildren, type ObjectType } from '$lib/objects';
import { getDefaultPropsForType } from '$lib/objects/default-props';
import { getType } from '$lib/object-types/registry';

export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const tree = objectsDb.getObjectTree(projectPath);
	if (!tree) return apiErrorResponse('Object tree not found', 404);
	return json(tree);
};

const TYPE_LABELS: Record<string, string> = {
	layout: 'Flex Layout',
	'flex-layout': 'Flex Layout',
	'grid-layout': 'Grid Layout',
	stack: 'Tab Layout',
	folder: 'Folder',
	gauge: 'Gauge',
	clock: 'Clock',
	timer: 'Timer',
	'time-strip': 'Time Strip',
	'telemetry-table': 'Telemetry Table',
	'line-plot': 'Line Plot',
	'bar-chart': 'Bar Chart',
	'scatter-plot': 'Scatter Plot',
	'overlay-plot': 'Overlay Plot',
	'stacked-plot': 'Stacked Plot',
	'function-plot': 'Function Plot',
	'map-view': 'Map View',
	'image-view': 'Image View',
	'comms-log': 'Comms Log',
	'video-feed': 'Video Feed',
	'notification-display': 'Notification Display',
	'realtime-timeline': 'Realtime Timeline',
	'condition-set': 'Condition Set',
	'summary-widget': 'Summary Widget',
	'markdown-note': 'Markdown Note',
	hyperlink: 'Hyperlink',
	'iframe-embed': 'Iframe Embed',
	'orbital-view': 'Orbital Track',
	'camera-feed': 'Camera Feed',
	'mic-audio': 'Mic Audio'
};

export const POST: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const body = await request.json();
	const { type, parentId, name, notes, props } = body as {
		type: string;
		parentId: string;
		name?: string;
		notes?: string;
		props?: Record<string, unknown>;
	};
	if (!type || !parentId) return apiErrorResponse('type and parentId required', 400);

	// Validate type is a registered object type
	if (!getType(type) && !TYPE_LABELS[type]) {
		return apiErrorResponse(
			`Unknown object type: ${type}. Valid types: ${Object.keys(TYPE_LABELS).join(', ')}`,
			400
		);
	}

	const parent = objectsDb.getObject(projectPath, parentId);
	if (!parent) return apiErrorResponse('Parent object not found', 404);
	if (!canContainChildren(parent.type as ObjectType)) {
		return apiErrorResponse(
			'Only folders, layout objects (flex/grid/tab), and project root can contain objects',
			400
		);
	}

	const nameStr = name ?? TYPE_LABELS[type] ?? 'Object';
	try {
		const defaults = getDefaultPropsForType(type as ObjectType);
		const mergedProps = { ...defaults, ...props };
		const obj = objectsDb.createObject(projectPath, {
			type,
			parentId,
			name: nameStr,
			notes,
			props: mergedProps
		});
		projectChanges.notify(params.id, { type: 'object-updated', objectId: obj.id });
		projectChanges.notify(params.id, { type: 'tree-changed' });
		return json(obj);
	} catch (e) {
		return handleApiError(e, 'POST /api/projects/[id]/objects');
	}
};
