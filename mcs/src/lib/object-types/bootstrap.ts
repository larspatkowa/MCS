/**
 * Registers all built-in object types, their view components, and property editors.
 * Import this module once at app startup (e.g. from +layout.svelte or root +page).
 *
 * View components are lazy-loaded via dynamic imports for code-splitting.
 * They are only fetched when the user first navigates to that view type.
 */
import {
	FolderOpen,
	LayoutList,
	Grid3x3,
	LayoutPanelLeft,
	ChartLine,
	ChartBar,
	ChartScatter,
	ChartArea,
	Gauge,
	Sigma,
	Layers,
	Activity,
	Crosshair,
	Box,
	Map,
	Clock,
	Table,
	GanttChart,
	BookOpen,
	Link,
	Globe,
	ShieldCheck,
	FileText,
	Orbit,
	Camera,
	Mic
} from '@lucide/svelte';
import ProjectProps from '$lib/components/properties/ProjectProps.svelte';
import FolderProps from '$lib/components/properties/FolderProps.svelte';
import GridLayoutProps from '$lib/components/properties/GridLayoutProps.svelte';
import StackProps from '$lib/components/properties/StackProps.svelte';
import TelemetryTableProps from '$lib/components/properties/TelemetryTableProps.svelte';
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
			typeId: 'stack',
			label: 'Tab Layout',
			icon: LayoutList,
			group: 'Containers',
			creatable: true
		},
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
		{ typeId: 'bar-chart', label: 'Bar Chart', icon: ChartBar, group: 'Charts', creatable: true },
		{
			typeId: 'scatter-plot',
			label: 'Scatter Plot',
			icon: ChartScatter,
			group: 'Charts',
			creatable: true
		},
		{
			typeId: 'overlay-plot',
			label: 'Overlay Plot',
			icon: ChartArea,
			group: 'Charts',
			creatable: true
		},
		{
			typeId: 'stacked-plot',
			label: 'Stacked Plot',
			icon: Layers,
			group: 'Charts',
			creatable: true
		},
		{
			typeId: 'function-plot',
			label: 'Function Plot',
			icon: Sigma,
			group: 'Charts',
			creatable: true
		},
		{
			typeId: 'polar-plot',
			label: 'Polar / Radar',
			icon: Crosshair,
			group: 'Charts',
			creatable: true
		},
		{ typeId: 'plot-3d', label: '3D Scatter', icon: Box, group: 'Charts', creatable: true },
		// Map
		{ typeId: 'map-view', label: 'Map', icon: Map, group: 'Visualization', creatable: true },
		// Instruments
		{ typeId: 'gauge', label: 'Gauge', icon: Gauge, group: 'Instruments', creatable: true },
		{ typeId: 'clock', label: 'Clock', icon: Clock, group: 'Instruments', creatable: true },
		// Data views
		{
			typeId: 'telemetry-table',
			label: 'Telemetry Table',
			icon: Table,
			group: 'Data',
			creatable: true
		},
		{
			typeId: 'gantt-chart',
			label: 'Gantt Chart',
			icon: GanttChart,
			group: 'Data',
			creatable: true
		},
		{ typeId: 'notebook', label: 'Notebook', icon: BookOpen, group: 'Data', creatable: true },
		{
			typeId: 'condition-set',
			label: 'Condition Set',
			icon: ShieldCheck,
			group: 'Data',
			creatable: true
		},
		{
			typeId: 'summary-widget',
			label: 'Summary Widget',
			icon: Activity,
			group: 'Data',
			creatable: true
		},
		// Content
		{ typeId: 'hyperlink', label: 'Hyperlink', icon: Link, group: 'Content', creatable: true },
		{
			typeId: 'iframe-embed',
			label: 'Iframe Embed',
			icon: Globe,
			group: 'Content',
			creatable: true
		},
		{
			typeId: 'markdown-note',
			label: 'Markdown Note',
			icon: FileText,
			group: 'Content',
			creatable: true
		},
		// Visualization
		{
			typeId: 'orbital-view',
			label: 'Orbital Track',
			icon: Orbit,
			group: 'Visualization',
			creatable: true
		},
		// Media
		{ typeId: 'camera-feed', label: 'Camera Feed', icon: Camera, group: 'Media', creatable: true },
		{ typeId: 'mic-audio', label: 'Mic Audio', icon: Mic, group: 'Media', creatable: true }
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
	registerView(
		'stack',
		lazy(() => import('$lib/components/center/StackView.svelte'))
	);
	// Charts
	registerView(
		'line-plot',
		lazy(() => import('$lib/components/center/LinePlotView.svelte'))
	);
	registerView(
		'scatter-plot',
		lazy(() => import('$lib/components/center/ScatterPlotView.svelte'))
	);
	registerView(
		'bar-chart',
		lazy(() => import('$lib/components/center/BarChartView.svelte'))
	);
	registerView(
		'overlay-plot',
		lazy(() => import('$lib/components/center/OverlayPlotView.svelte'))
	);
	registerView(
		'stacked-plot',
		lazy(() => import('$lib/components/center/StackedPlotView.svelte'))
	);
	registerView(
		'polar-plot',
		lazy(() => import('$lib/components/center/PolarPlotView.svelte'))
	);
	registerView(
		'plot-3d',
		lazy(() => import('$lib/components/center/Plot3DView.svelte'))
	);
	registerView(
		'function-plot',
		lazy(() => import('$lib/components/center/FunctionPlotView.svelte'))
	);
	// Map
	registerView(
		'map-view',
		lazy(() => import('$lib/components/center/MapView.svelte'))
	);
	// Instruments
	registerView(
		'gauge',
		lazy(() => import('$lib/components/center/GaugeView.svelte'))
	);
	registerView(
		'clock',
		lazy(() => import('$lib/components/center/ClockView.svelte'))
	);
	// Data views
	registerView(
		'telemetry-table',
		lazy(() => import('$lib/components/center/TelemetryTableView.svelte'))
	);
	registerView(
		'gantt-chart',
		lazy(() => import('$lib/components/center/GanttChartView.svelte'))
	);
	registerView(
		'notebook',
		lazy(() => import('$lib/components/center/NotebookView.svelte'))
	);
	registerView(
		'condition-set',
		lazy(() => import('$lib/components/center/ConditionSetView.svelte'))
	);
	registerView(
		'summary-widget',
		lazy(() => import('$lib/components/center/SummaryWidgetView.svelte'))
	);
	// Content
	registerView(
		'hyperlink',
		lazy(() => import('$lib/components/center/HyperlinkView.svelte'))
	);
	registerView(
		'iframe-embed',
		lazy(() => import('$lib/components/center/IframeEmbedView.svelte'))
	);
	registerView(
		'markdown-note',
		lazy(() => import('$lib/components/center/MarkdownNoteView.svelte'))
	);
	// Visualization
	registerView(
		'orbital-view',
		lazy(() => import('$lib/components/center/OrbitalView.svelte'))
	);
	// Media
	registerView(
		'camera-feed',
		lazy(() => import('$lib/components/center/CameraFeedView.svelte'))
	);
	registerView(
		'mic-audio',
		lazy(() => import('$lib/components/center/MicAudioView.svelte'))
	);
}

function bootstrapPropertyEditors(): void {
	registerPropertyEditor('project', ProjectProps);
	registerPropertyEditor('folder', FolderProps);
	registerPropertyEditor('grid-layout', GridLayoutProps);
	registerPropertyEditor('stack', StackProps);
	registerPropertyEditor('telemetry-table', TelemetryTableProps);
}

export function bootstrapObjectTypes(): void {
	bootstrapTypes();
	bootstrapViews();
	bootstrapPropertyEditors();
}
