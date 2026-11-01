/**
 * Registers all built-in object types, their view components, and property editors.
 * Import this module once at app startup (e.g. from +layout.svelte or root +page).
 *
 * View components are lazy-loaded via dynamic imports for code-splitting.
 * They are only fetched when the user first navigates to that view type.
 */
import {
	FolderOpen,
	Grid3x3,
	LayoutPanelLeft,
	ChartLine,
	Gauge,
	Table,
	FileText,
	Image as ImageIcon,
	Video
} from '@lucide/svelte';
import ProjectProps from '$lib/components/properties/ProjectProps.svelte';
import FolderProps from '$lib/components/properties/FolderProps.svelte';
import GridLayoutProps from '$lib/components/properties/GridLayoutProps.svelte';
import TelemetryTableProps from '$lib/components/properties/TelemetryTableProps.svelte';
import MediaStreamProps from '$lib/components/properties/MediaStreamProps.svelte';
import { registerType } from './registry.js';
import { registerView, lazy } from './views.js';
import { registerPropertyEditor } from './property-editors.js';
import { getDefaultPropsForType } from '$lib/objects/default-props.js';
import type { ObjectType } from '$lib/objects/types.js';

function bootstrapTypes(): void {
	const builtIn: {
		typeId: ObjectType | string;
		label: string;
		icon: typeof Grid3x3;
		group: string;
		creatable: boolean;
	}[] = [
		// Containers
		{ typeId: 'folder', label: 'Folder', icon: FolderOpen, group: 'Containers', creatable: true },
		{
			typeId: 'grid-layout',
			label: 'Grid Layout',
			icon: Grid3x3,
			group: 'Containers',
			creatable: true
		},
		{
			typeId: 'flex-layout',
			label: 'Flex Layout',
			icon: LayoutPanelLeft,
			group: 'Containers',
			creatable: true
		},
		{ typeId: 'project', label: 'Project', icon: FolderOpen, group: 'Root', creatable: false },
		// Charts
		{ typeId: 'line-plot', label: 'Line Plot', icon: ChartLine, group: 'Charts', creatable: true },
		// Instruments
		{ typeId: 'gauge', label: 'Gauge', icon: Gauge, group: 'Instruments', creatable: true },
		// Data views
		{
			typeId: 'telemetry-table',
			label: 'Telemetry Table',
			icon: Table,
			group: 'Data',
			creatable: true
		},
		// Content
		{
			typeId: 'markdown-note',
			label: 'Markdown Note',
			icon: FileText,
			group: 'Content',
			creatable: true
		},
		// Media
		{ typeId: 'image', label: 'Image', icon: ImageIcon, group: 'Media', creatable: true },
		{ typeId: 'video-stream', label: 'Video', icon: Video, group: 'Media', creatable: true }
	];

	for (const { typeId, label, icon, group, creatable } of builtIn) {
		registerType(typeId, {
			label,
			icon,
			group,
			creatable,
			defaultProps: getDefaultPropsForType(typeId as ObjectType)
		});
	}
}

function bootstrapViews(): void {
	// Containers
	registerView(
		'grid-layout',
		lazy(() => import('$lib/components/center/GridLayoutView.svelte'))
	);
	registerView(
		'flex-layout',
		lazy(() => import('$lib/components/center/FlexLayoutView.svelte'))
	);
	// Charts
	registerView(
		'line-plot',
		lazy(() => import('$lib/components/center/LinePlotView.svelte'))
	);
	// Instruments
	registerView(
		'gauge',
		lazy(() => import('$lib/components/center/GaugeView.svelte'))
	);
	// Data views
	registerView(
		'telemetry-table',
		lazy(() => import('$lib/components/center/TelemetryTableView.svelte'))
	);
	// Content
	registerView(
		'markdown-note',
		lazy(() => import('$lib/components/center/MarkdownNoteView.svelte'))
	);
	// Media
	registerView(
		'image',
		lazy(() => import('$lib/components/center/ImageView.svelte'))
	);
	registerView(
		'video-stream',
		lazy(() => import('$lib/components/center/VideoStreamView.svelte'))
	);
}

function bootstrapPropertyEditors(): void {
	registerPropertyEditor('project', ProjectProps);
	registerPropertyEditor('folder', FolderProps);
	registerPropertyEditor('grid-layout', GridLayoutProps);
	registerPropertyEditor('telemetry-table', TelemetryTableProps);
	registerPropertyEditor('video-stream', MediaStreamProps);
	registerPropertyEditor('image', MediaStreamProps);
}

export function bootstrapObjectTypes(): void {
	bootstrapTypes();
	bootstrapViews();
	bootstrapPropertyEditors();
}
