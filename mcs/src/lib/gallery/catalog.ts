import type { GalleryCatalogEntry } from './types.js';
import * as data from './data.js';

const CATALOG: GalleryCatalogEntry[] = [
	// Line plot
	{
		typeId: 'line-plot',
		variantId: 'sine',
		label: 'Sine Trend',
		buildObjects: data.buildLinePlotSine
	},
	{
		typeId: 'line-plot',
		variantId: 'step',
		label: 'Step Response',
		buildObjects: data.buildLinePlotStep
	},
	{
		typeId: 'line-plot',
		variantId: 'random',
		label: 'High Frequency',
		buildObjects: data.buildLinePlotRandom
	},
	{
		typeId: 'line-plot',
		variantId: 'multi-series',
		label: 'Multi-Signal',
		buildObjects: data.buildLinePlotMultiSeries
	},
	{
		typeId: 'line-plot',
		variantId: 'rocket-flight',
		label: 'Rocket Flight',
		buildObjects: data.buildLinePlotRocketFlight
	},
	// Bar chart
	{
		typeId: 'bar-chart',
		variantId: 'vertical',
		label: 'Vertical Buckets',
		buildObjects: data.buildBarChartVertical
	},
	{
		typeId: 'bar-chart',
		variantId: 'horizontal',
		label: 'Horizontal Buckets',
		buildObjects: data.buildBarChartHorizontal
	},
	// Scatter plot
	{
		typeId: 'scatter-plot',
		variantId: 'default',
		label: 'Correlation',
		buildObjects: data.buildScatterPlot
	},
	// Overlay plot
	{
		typeId: 'overlay-plot',
		variantId: 'default',
		label: 'Comparative',
		buildObjects: data.buildOverlayPlot
	},
	// Polar coordinate chart
	{
		typeId: 'polar-plot',
		variantId: 'angle-r',
		label: 'Polar (θ, r)',
		buildObjects: data.buildPolarPlotRadar
	},
	// 3D Scatter
	{
		typeId: 'plot-3d',
		variantId: 'flight',
		label: 'Flight Path',
		buildObjects: data.buildPlot3DScatter
	},
	// Gauge
	{ typeId: 'gauge', variantId: 'linear', label: 'Linear', buildObjects: data.buildGaugeLinear },
	{ typeId: 'gauge', variantId: 'dial', label: 'Dial', buildObjects: data.buildGaugeDial },
	{
		typeId: 'gauge',
		variantId: 'with-thresholds',
		label: 'Threshold Monitor',
		buildObjects: data.buildGaugeWithThresholds
	},
	// Flexible split layout
	{
		typeId: 'flex-layout',
		variantId: 'two-panes',
		label: 'Two panes',
		buildObjects: data.buildLayoutTwoPanes
	},
	// Grid layout
	{
		typeId: 'grid-layout',
		variantId: '2x2',
		label: '2x2',
		buildObjects: data.buildGridLayout2x2
	},
	{
		typeId: 'grid-layout',
		variantId: 'operations-board',
		label: 'Operations Board',
		buildObjects: data.buildGridLayoutOpsBoard
	},
	// Stack
	{ typeId: 'stack', variantId: 'tabs', label: 'Tabs', buildObjects: data.buildStackTabs },
	// Clock
	{ typeId: 'clock', variantId: '12h', label: '12-hour', buildObjects: data.buildClock12h },
	{ typeId: 'clock', variantId: '24h', label: '24-hour', buildObjects: data.buildClock24h },
	{ typeId: 'clock', variantId: 'analog', label: 'Analog', buildObjects: data.buildClockAnalog },
	{
		typeId: 'clock',
		variantId: 'world',
		label: 'World Clocks',
		buildObjects: data.buildClockWorldClocks
	},
	// Map
	{
		typeId: 'map-view',
		variantId: 'gps-track',
		label: 'GPS Track',
		buildObjects: data.buildMapViewGpsTrack
	},
	{
		typeId: 'map-view',
		variantId: 'topographic',
		label: 'Topographic',
		buildObjects: data.buildMapViewTopographic
	},
	// Gantt chart
	{
		typeId: 'gantt-chart',
		variantId: 'default',
		label: 'Timeline',
		buildObjects: data.buildGanttChart
	},
	// Notebook
	{
		typeId: 'notebook',
		variantId: 'default',
		label: 'Mission Log',
		buildObjects: data.buildNotebook
	},
	// Hyperlink
	{
		typeId: 'hyperlink',
		variantId: 'default',
		label: 'External Link',
		buildObjects: data.buildHyperlink
	},
	// Iframe embed
	{
		typeId: 'iframe-embed',
		variantId: 'default',
		label: 'Embedded Content',
		buildObjects: data.buildIframeEmbed
	},
	// Condition set
	{
		typeId: 'condition-set',
		variantId: 'default',
		label: 'System Status',
		buildObjects: data.buildConditionSet
	},
	// Summary widget
	{
		typeId: 'summary-widget',
		variantId: 'default',
		label: 'Status Banner',
		buildObjects: data.buildSummaryWidget
	},
	// Markdown note
	{
		typeId: 'markdown-note',
		variantId: 'default',
		label: 'Checklist',
		buildObjects: data.buildMarkdownNote
	},
	// Stacked plot
	{
		typeId: 'stacked-plot',
		variantId: 'multi-channel',
		label: 'Multi-Channel',
		buildObjects: data.buildStackedPlot
	},
	// Telemetry table
	{
		typeId: 'telemetry-table',
		variantId: 'default',
		label: 'Live Readings',
		buildObjects: data.buildTelemetryTable
	},
	// Orbital view
	{
		typeId: 'orbital-view',
		variantId: 'ground-track',
		label: 'Ground Track',
		buildObjects: data.buildOrbitalView
	},
	{
		typeId: 'orbital-view',
		variantId: 'iss',
		label: 'ISS Orbit',
		buildObjects: data.buildOrbitalViewISS
	}
];

export function getGalleryCatalog(): GalleryCatalogEntry[] {
	return CATALOG;
}

export function getGalleryEntry(
	typeId: string,
	variantId: string
): GalleryCatalogEntry | undefined {
	return CATALOG.find((e) => e.typeId === typeId && e.variantId === variantId);
}

export function getDefaultEntry(): GalleryCatalogEntry {
	return CATALOG[0];
}

export function getFirstVariantForType(typeId: string): GalleryCatalogEntry | undefined {
	return CATALOG.find((e) => e.typeId === typeId);
}
