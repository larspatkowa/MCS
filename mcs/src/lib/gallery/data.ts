import type { MCSObject, FlexPane } from '$lib/objects/types.js';
import type { LayoutNode } from '$lib/objects/types.js';
import { createLeaf, createSplit } from '$lib/objects/layout.js';
import type { GalleryVariantResult } from './types.js';

const NOW = new Date().toISOString();

function obj(
	id: string,
	type: MCSObject['type'],
	name: string,
	props: Record<string, unknown>
): MCSObject {
	return {
		id,
		type,
		name,
		notes: '',
		createdAt: NOW,
		updatedAt: NOW,
		props
	};
}

// --- Line plot
export function buildLinePlotSine(): GalleryVariantResult {
	const rootId = 'gallery-line-sine';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'line-plot', 'Line Plot (Sine Trend)', {
			dataSources: ['sample:sine'],
			seriesNames: ['Sine trend'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Signal (%)' }
		})
	);
	return { rootId, objects };
}

export function buildLinePlotStep(): GalleryVariantResult {
	const rootId = 'gallery-line-step';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'line-plot', 'Line Plot (Step Response)', {
			dataSources: ['sample:step'],
			seriesNames: ['Commanded step'],
			interpolation: 'step',
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Command (%)' }
		})
	);
	return { rootId, objects };
}

export function buildLinePlotRandom(): GalleryVariantResult {
	const rootId = 'gallery-line-random';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'line-plot', 'Line Plot (High Frequency)', {
			dataSources: ['sample:random'],
			seriesNames: ['High-frequency noise'],
			interpolation: 'smooth',
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Amplitude (%)' }
		})
	);
	return { rootId, objects };
}

export function buildLinePlotMultiSeries(): GalleryVariantResult {
	const rootId = 'gallery-line-multi';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'line-plot', 'Line Plot (Multi-Signal)', {
			dataSources: ['sample:sine', 'sample:random', 'sample:step'],
			seriesNames: ['Sine trend', 'High-frequency noise', 'Commanded step'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Signal (%)' }
		})
	);
	return { rootId, objects };
}

export function buildLinePlotRocketFlight(): GalleryVariantResult {
	const rootId = 'gallery-line-rocket-flight';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'line-plot', 'Line Plot (Rocket Flight)', {
			dataSources: ['sample:altitude', 'sample:velocity'],
			seriesNames: ['Altitude (m)', 'Velocity (m/s)'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 3000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Value' }
		})
	);
	return { rootId, objects };
}

// --- Bar chart
export function buildBarChartVertical(): GalleryVariantResult {
	const rootId = 'gallery-bar-vertical';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'bar-chart', 'Bar Chart (Vertical Buckets)', {
			dataSource: 'sample:step',
			xKey: 'timestamp',
			yKey: 'value',
			orientation: 'vertical',
			grouped: false,
			stacked: false,
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'Time bucket' },
			yAxis: { label: 'Average value' }
		})
	);
	return { rootId, objects };
}

export function buildBarChartHorizontal(): GalleryVariantResult {
	const rootId = 'gallery-bar-horizontal';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'bar-chart', 'Bar Chart (Horizontal Buckets)', {
			dataSource: 'sample:sine',
			xKey: 'timestamp',
			yKey: 'value',
			orientation: 'horizontal',
			grouped: false,
			stacked: false,
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'Average value' },
			yAxis: { label: 'Time bucket' }
		})
	);
	return { rootId, objects };
}

// --- Scatter plot
export function buildScatterPlot(): GalleryVariantResult {
	const rootId = 'gallery-scatter-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'scatter-plot', 'Scatter Plot (Signal Correlation)', {
			dataSources: ['sample:sine', 'sample:random'],
			xKey: 'value',
			yKey: 'value',
			markerSize: 4,
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'Sine trend (%)' },
			yAxis: { label: 'Noise signal (%)' }
		})
	);
	return { rootId, objects };
}

// --- Overlay plot
export function buildOverlayPlot(): GalleryVariantResult {
	const rootId = 'gallery-overlay-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'overlay-plot', 'Overlay Plot (Comparative)', {
			series: [
				{
					dataSource: 'sample:sine',
					name: 'Sine trend',
					interpolation: 'smooth',
					color: '#4f9cf9'
				},
				{
					dataSource: 'sample:random',
					name: 'Noise signal',
					interpolation: 'linear',
					color: '#f97316'
				}
			],
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Signal (%)' }
		})
	);
	return { rootId, objects };
}

// --- Stacked plot
export function buildStackedPlot(): GalleryVariantResult {
	const rootId = 'gallery-stacked-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'stacked-plot', 'Stacked Plot (Split Channels)', {
			series: [
				{ dataSource: 'sample:sine', name: 'Sine trend', color: '#4f9cf9' },
				{ dataSource: 'sample:random', name: 'Noise signal', color: '#f97316' },
				{ dataSource: 'sample:step', name: 'Commanded step', color: '#10b981' }
			],
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Signal (%)' }
		})
	);
	return { rootId, objects };
}

// --- Function plot
export function buildFunctionPlot(): GalleryVariantResult {
	const rootId = 'gallery-function-plot-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'function-plot', 'Function Plot (Synthetic Telemetry)', {
			expression: '62 + 9 * sin(t / 110) + 4 * cos(t / 37)',
			sampleCount: 240,
			color: '#5ac8fa',
			strokeWidth: 2,
			showGrid: true,
			yAxisLabel: 'Model value'
		})
	);
	return { rootId, objects };
}

// --- Gauge
export function buildGaugeLinear(): GalleryVariantResult {
	const rootId = 'gallery-gauge-linear';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'gauge', 'Gauge (Linear Range)', {
			dataSource: 'sample:sine',
			min: 0,
			max: 100,
			unit: '',
			label: 'Sine trend',
			displayType: 'linear',
			precision: 2,
			showRangeLabels: true,
			trackOpacity: 0.6,
			thresholdOpacity: 0.5
		})
	);
	return { rootId, objects };
}

export function buildGaugeDial(): GalleryVariantResult {
	const rootId = 'gallery-gauge-dial';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'gauge', 'Gauge (Dial Arc)', {
			dataSource: 'sample:sine',
			min: 0,
			max: 100,
			unit: '%',
			label: 'Sine trend',
			displayType: 'dial',
			precision: 1,
			showRangeLabels: true,
			trackOpacity: 0.6,
			thresholdOpacity: 0.5
		})
	);
	return { rootId, objects };
}

export function buildGaugeWithThresholds(): GalleryVariantResult {
	const rootId = 'gallery-gauge-thresholds';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'gauge', 'Gauge (Threshold Monitor)', {
			dataSource: 'sample:sine',
			min: 0,
			max: 100,
			thresholdMin: 25,
			thresholdMax: 75,
			unit: '%',
			label: 'Sine trend',
			displayType: 'dial',
			precision: 1,
			showRangeLabels: true,
			trackOpacity: 0.6,
			thresholdOpacity: 0.5
		})
	);
	return { rootId, objects };
}

// --- Flexible split layout: two panes with gauge + line-plot
export function buildLayoutTwoPanes(): GalleryVariantResult {
	const gaugeId = 'gallery-layout-gauge-1';
	const lineId = 'gallery-layout-line-1';
	const rootId = 'gallery-layout-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		gaugeId,
		obj(gaugeId, 'gauge', 'Realtime Gauge', {
			dataSource: 'sample:sine',
			min: 0,
			max: 100,
			unit: '',
			label: 'Sine trend',
			displayType: 'linear',
			precision: 2,
			showRangeLabels: true
		})
	);
	objects.set(
		lineId,
		obj(lineId, 'line-plot', 'Telemetry Trend', {
			dataSources: ['sample:sine'],
			seriesNames: ['Sine trend'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 5000
		})
	);
	const root: FlexPane = {
		id: 'flex-root',
		type: 'split',
		direction: 'horizontal',
		ratio: 0.5,
		children: [
			{ id: 'flex-left', type: 'leaf', objectId: gaugeId },
			{ id: 'flex-right', type: 'leaf', objectId: lineId }
		]
	};
	objects.set(rootId, obj(rootId, 'flex-layout', 'Flex Layout (Two Panes)', { root }));
	return { rootId, objects };
}

// --- Grid layout: 2x2
export function buildGridLayout2x2(): GalleryVariantResult {
	const g1 = 'gallery-grid-gauge-1';
	const g2 = 'gallery-grid-gauge-2';
	const lineId = 'gallery-grid-line-1';
	const clockId = 'gallery-grid-clock-1';
	const rootId = 'gallery-grid-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		g1,
		obj(g1, 'gauge', 'Sine Gauge', {
			dataSource: 'sample:sine',
			min: 0,
			max: 100,
			unit: '',
			label: 'Sine',
			displayType: 'linear',
			precision: 2,
			showRangeLabels: true,
			trackOpacity: 0.6,
			thresholdOpacity: 0.5
		})
	);
	objects.set(
		g2,
		obj(g2, 'gauge', 'Noise Gauge', {
			dataSource: 'sample:random',
			min: 0,
			max: 100,
			unit: '',
			label: 'Random',
			displayType: 'dial',
			precision: 2,
			showRangeLabels: true,
			trackOpacity: 0.6,
			thresholdOpacity: 0.5
		})
	);
	objects.set(
		lineId,
		obj(lineId, 'line-plot', 'Dual Trend Plot', {
			dataSources: ['sample:sine', 'sample:random'],
			seriesNames: ['Sine trend', 'Noise signal'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Signal (%)' }
		})
	);
	objects.set(
		clockId,
		obj(clockId, 'clock', 'Clock', { timezone: '', showDate: true, use12h: false })
	);
	objects.set(
		rootId,
		obj(rootId, 'grid-layout', 'Grid Layout (2x2)', {
			gridSize: [24, 24],
			items: [
				{ id: 'item-1', objectId: g1, x: 0, y: 0, width: 12, height: 12 },
				{ id: 'item-2', objectId: g2, x: 12, y: 0, width: 12, height: 12 },
				{ id: 'item-3', objectId: lineId, x: 0, y: 12, width: 12, height: 12 },
				{ id: 'item-4', objectId: clockId, x: 12, y: 12, width: 12, height: 12 }
			],
			dimensions: undefined,
			scaleToFit: true
		})
	);
	return { rootId, objects };
}

export function buildGridLayoutOpsBoard(): GalleryVariantResult {
	const mapId = 'gallery-grid-ops-map';
	const batteryId = 'gallery-grid-ops-battery';
	const statusId = 'gallery-grid-ops-status';
	const lineId = 'gallery-grid-ops-line';
	const rootId = 'gallery-grid-ops';
	const objects = new Map<string, MCSObject>();

	objects.set(
		mapId,
		obj(mapId, 'map-view', 'Survey Map', {
			gpsStreamId: 'sample:gps',
			baseLayer: 'topographic',
			showGpsTrail: true,
			showMarker: true,
			autoFollow: true
		})
	);
	objects.set(
		batteryId,
		obj(batteryId, 'gauge', 'Battery Reserve', {
			dataSource: 'sample:battery',
			min: 0,
			max: 100,
			unit: '%',
			displayType: 'linear',
			precision: 0,
			thresholdMin: 20,
			warningMin: 35
		})
	);
	objects.set(
		statusId,
		obj(statusId, 'summary-widget', 'Mission Status', {
			okLabel: 'Mission nominal',
			okDetail: '',
			okColor: '#238636',
			rules: [
				{
					streamId: 'sample:temperature',
					op: 'gt',
					threshold: 85,
					label: 'Thermal warning',
					message: 'Reduce payload load',
					color: '#d29922'
				},
				{
					streamId: 'sample:battery',
					op: 'lt',
					threshold: 18,
					label: 'Battery reserve low',
					message: 'Plan immediate return',
					color: '#ef4444'
				}
			]
		})
	);
	objects.set(
		lineId,
		obj(lineId, 'line-plot', 'Altitude vs Velocity', {
			dataSources: ['sample:altitude', 'sample:velocity'],
			seriesNames: ['Altitude', 'Velocity'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 3000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Value' }
		})
	);
	objects.set(
		rootId,
		obj(rootId, 'grid-layout', 'Grid Layout (Operations Board)', {
			gridSize: [24, 24],
			items: [
				{ id: 'ops-map', objectId: mapId, x: 0, y: 0, width: 14, height: 14 },
				{ id: 'ops-status', objectId: statusId, x: 14, y: 0, width: 10, height: 8 },
				{ id: 'ops-battery', objectId: batteryId, x: 14, y: 8, width: 10, height: 6 },
				{ id: 'ops-line', objectId: lineId, x: 0, y: 14, width: 24, height: 10 }
			],
			dimensions: [960, 720],
			scaleToFit: true
		})
	);

	return { rootId, objects };
}

// --- Stack: tabs with line-plot, gauge, clock
export function buildStackTabs(): GalleryVariantResult {
	const lineId = 'gallery-stack-line-1';
	const gaugeId = 'gallery-stack-gauge-1';
	const clockId = 'gallery-stack-clock-1';
	const rootId = 'gallery-stack-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		lineId,
		obj(lineId, 'line-plot', 'Trend Plot', {
			dataSources: ['sample:sine'],
			seriesNames: ['Sine trend'],
			interpolation: 'linear',
			showGrid: true,
			pollInterval: 5000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'Signal (%)' }
		})
	);
	objects.set(
		gaugeId,
		obj(gaugeId, 'gauge', 'Noise Gauge', {
			dataSource: 'sample:random',
			min: 0,
			max: 100,
			unit: '',
			label: 'Noise signal',
			displayType: 'dial',
			precision: 2,
			showRangeLabels: true,
			trackOpacity: 0.6,
			thresholdOpacity: 0.5
		})
	);
	objects.set(
		clockId,
		obj(clockId, 'clock', 'Clock', { timezone: '', showDate: true, use12h: false })
	);
	objects.set(
		rootId,
		obj(rootId, 'stack', 'Tab Layout', {
			objectIds: [lineId, gaugeId, clockId],
			activeIndex: 0,
			autoCycleSeconds: 0
		})
	);
	return { rootId, objects };
}

// --- Clock
export function buildClock12h(): GalleryVariantResult {
	const rootId = 'gallery-clock-12h';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'clock', 'Clock (12h)', { timezone: '', showDate: true, use12h: true })
	);
	return { rootId, objects };
}

export function buildClock24h(): GalleryVariantResult {
	const rootId = 'gallery-clock-24h';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'clock', 'Clock (24h)', { timezone: '', showDate: true, use12h: false })
	);
	return { rootId, objects };
}

// --- Timer
export function buildTimerCountDown(): GalleryVariantResult {
	const rootId = 'gallery-timer-down';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'timer', 'Timer (Count down)', {
			targetTime: Math.floor(Date.now() / 1000) + 3600,
			direction: 'count-down',
			format: 'short',
			paused: false
		})
	);
	return { rootId, objects };
}

export function buildTimerCountUp(): GalleryVariantResult {
	const rootId = 'gallery-timer-up';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'timer', 'Timer (Count up)', {
			targetTime: Math.floor(Date.now() / 1000) - 60,
			direction: 'count-up',
			format: 'short',
			paused: false
		})
	);
	return { rootId, objects };
}

// --- Time strip
export function buildTimeStrip(): GalleryVariantResult {
	const rootId = 'gallery-time-strip-1';
	const objects = new Map<string, MCSObject>();
	objects.set(rootId, obj(rootId, 'time-strip', 'Time Strip', { showAnnotations: true }));
	return { rootId, objects };
}

// --- Telemetry table (columns point to sample streams; table may need gallery branch to show data)
export function buildTelemetryTable(): GalleryVariantResult {
	const rootId = 'gallery-telemetry-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'telemetry-table', 'Telemetry Table', {
			columns: [
				{ streamId: 'sample:sine', field: 'value', label: 'Sine trend' },
				{ streamId: 'sample:random', field: 'value', label: 'Noise signal' }
			],
			rowLimit: 120
		})
	);
	return { rootId, objects };
}

// --- Polar coordinate chart
export function buildPolarPlotRadar(): GalleryVariantResult {
	const rootId = 'gallery-polar-radar';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'polar-plot', 'Polar Chart (Angle vs Velocity)', {
			series: [
				{
					thetaSource: 'sample:angle',
					rSource: 'sample:velocity',
					thetaUnit: 'degrees',
					name: 'Velocity',
					connect: true
				},
				{
					thetaSource: 'sample:angle',
					rSource: 'sample:altitude',
					thetaUnit: 'degrees',
					name: 'Altitude',
					connect: true
				}
			],
			gridRings: 5,
			angleStep: 30,
			angleLabels: 'degrees',
			showDots: true,
			showLine: true,
			windowSec: 60,
			pollInterval: 1500
		})
	);
	return { rootId, objects };
}

// --- 3D Scatter
export function buildPlot3DScatter(): GalleryVariantResult {
	const rootId = 'gallery-plot3d-flight';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'plot-3d', '3D Scatter (Flight Data)', {
			series: [
				{
					xSource: 'sample:altitude',
					ySource: 'sample:velocity',
					zSource: 'sample:accel_z',
					name: 'Flight path',
					markerSize: 4
				}
			],
			azimuth: 30,
			elevation: 22,
			pollInterval: 4000,
			xAxis: { label: 'Altitude (m)' },
			yAxis: { label: 'Velocity (m/s)' },
			zAxis: { label: 'Accel Z (m/s²)' }
		})
	);
	return { rootId, objects };
}

// --- Map view (GPS ground track)
export function buildMapViewGpsTrack(): GalleryVariantResult {
	const rootId = 'gallery-map-gps-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'map-view', 'Map View (GPS Track)', {
			viewMode: 'map',
			dataSource: '',
			latitudeField: 'lat',
			longitudeField: 'lon',
			altitudeField: 'alt',
			baseLayer: 'satellite',
			zoom: 12,
			defaultLat: 34.0,
			defaultLon: -117.0,
			showTrail: true,
			trailWindowSec: 600,
			trailMaxPoints: 300,
			autoFollow: true,
			pathColor: '#f97316',
			markerColor: '#ef4444',
			showPredictedOrbit: false
		})
	);
	return { rootId, objects };
}

export function buildMapViewTopographic(): GalleryVariantResult {
	const rootId = 'gallery-map-topo-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'map-view', 'Map View (Topographic)', {
			viewMode: 'map',
			dataSource: '',
			latitudeField: 'lat',
			longitudeField: 'lon',
			altitudeField: 'alt',
			baseLayer: 'topographic',
			zoom: 10,
			defaultLat: 36.5,
			defaultLon: -118.0,
			showTrail: true,
			trailWindowSec: 600,
			trailMaxPoints: 300,
			autoFollow: false,
			pathColor: '#2dd4bf',
			markerColor: '#f59e0b',
			showPredictedOrbit: false
		})
	);
	return { rootId, objects };
}

// --- Clock (analog)
export function buildClockAnalog(): GalleryVariantResult {
	const rootId = 'gallery-clock-analog';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'clock', 'Clock (Analog)', {
			timezone: '',
			showDate: true,
			use12h: false,
			analog: true
		})
	);
	return { rootId, objects };
}

// --- Clock (world clocks)
export function buildClockWorldClocks(): GalleryVariantResult {
	const rootId = 'gallery-clock-world';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'clock', 'World Clocks', {
			timezone: 'UTC',
			showDate: false,
			use12h: false,
			analog: true,
			worldClocks: [
				{ timezone: 'UTC', label: 'UTC' },
				{ timezone: 'America/New_York', label: 'New York' },
				{ timezone: 'America/Los_Angeles', label: 'Los Angeles' },
				{ timezone: 'Europe/London', label: 'London' },
				{ timezone: 'Asia/Tokyo', label: 'Tokyo' }
			]
		})
	);
	return { rootId, objects };
}

// --- Gantt chart
export function buildGanttChart(): GalleryVariantResult {
	const rootId = 'gallery-gantt-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'gantt-chart', 'Gantt Chart', {
			tasks: [],
			showNow: true,
			windowSec: 3600,
			rowHeight: 32,
			labelWidth: 140
		})
	);
	return { rootId, objects };
}

// --- Notebook
export function buildNotebook(): GalleryVariantResult {
	const rootId = 'gallery-notebook-1';
	const nowTs = Date.now();
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'notebook', 'Notebook', {
			entries: [
				{
					id: 'n1',
					timestamp: nowTs - 60000,
					text: 'Telemetry nominal across all channels',
					author: 'Operator',
					tags: ['status']
				},
				{
					id: 'n2',
					timestamp: nowTs - 30000,
					text: 'S-band handover to Goldstone station complete',
					author: 'COMM',
					tags: ['comms', 'handover']
				},
				{
					id: 'n3',
					timestamp: nowTs,
					text: 'Vehicle attitude within 0.1° of target',
					author: 'GNC',
					tags: ['gnc']
				}
			],
			label: 'Mission Log',
			showTags: true,
			showAuthor: true,
			newestFirst: true
		})
	);
	return { rootId, objects };
}

// --- Hyperlink
export function buildHyperlink(): GalleryVariantResult {
	const rootId = 'gallery-hyperlink-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'hyperlink', 'Hyperlink', {
			url: 'https://www.nasa.gov',
			displayText: 'NASA Homepage',
			icon: 'link',
			newTab: true
		})
	);
	return { rootId, objects };
}

// --- Iframe embed
export function buildIframeEmbed(): GalleryVariantResult {
	const rootId = 'gallery-iframe-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'iframe-embed', 'Iframe Embed', {
			url: 'https://www.openstreetmap.org/export/embed.html?bbox=-80.7%2C28.4%2C-80.5%2C28.7&layer=mapnik',
			sandbox: 'allow-scripts allow-same-origin',
			title: 'Embedded Map'
		})
	);
	return { rootId, objects };
}

// --- Condition set
export function buildConditionSet(): GalleryVariantResult {
	const rootId = 'gallery-condset-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'condition-set', 'Condition Set', {
			conditions: [
				{
					id: 'c1',
					streamId: 'sample:sine',
					op: 'gt',
					value: 0.5,
					label: 'Sine High',
					outputTrue: 'ACTIVE',
					outputFalse: 'IDLE',
					colorTrue: '#22c55e',
					colorFalse: '#6b7280'
				},
				{
					id: 'c2',
					streamId: 'sample:random',
					op: 'lt',
					value: 0.3,
					label: 'Noise Low',
					outputTrue: 'LOW',
					outputFalse: 'OK',
					colorTrue: '#f59e0b',
					colorFalse: '#22c55e'
				},
				{
					id: 'c3',
					streamId: 'sample:velocity',
					op: 'between',
					value: 100,
					value2: 500,
					label: 'Velocity Range',
					outputTrue: 'IN RANGE',
					outputFalse: 'OUT',
					colorTrue: '#22c55e',
					colorFalse: '#ef4444'
				}
			],
			mode: 'widget',
			label: 'System Conditions'
		})
	);
	return { rootId, objects };
}

// --- Summary widget
export function buildSummaryWidget(): GalleryVariantResult {
	const rootId = 'gallery-summary-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'summary-widget', 'Summary Widget', {
			rules: [
				{ streamId: 'sample:sine', op: 'gt', threshold: 0.9, label: 'CAUTION', color: '#f59e0b' },
				{
					streamId: 'sample:random',
					op: 'gt',
					threshold: 0.95,
					label: 'CRITICAL',
					color: '#ef4444'
				}
			],
			okLabel: 'NOMINAL',
			okColor: '#22c55e'
		})
	);
	return { rootId, objects };
}

// --- Markdown note
export function buildMarkdownNote(): GalleryVariantResult {
	const rootId = 'gallery-markdown-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'markdown-note', 'Markdown Note', {
			content:
				'# Flight Operations Checklist\n\n## Pre-Launch\n- Telemetry links verified\n- Range safety concurrence received\n- Weather constraints met\n\n## Ascent\n1. **Max Q** — monitor structural loads\n2. **MECO** — main engine cutoff\n3. **Stage separation** — confirm telemetry handover\n\n---\n\n> *All personnel: maintain comm discipline during terminal count.*\n\n```\nT-00:10:00  Final poll\nT-00:00:10  Autosequence start\nT+00:00:00  LIFTOFF\n```'
		})
	);
	return { rootId, objects };
}

// --- Orbital view
export function buildOrbitalView(): GalleryVariantResult {
	const rootId = 'gallery-orbital-1';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'orbital-view', 'Orbital Ground Track', {
			gpsStreamId: 'sample:gps',
			showTrail: true,
			trailColor: '#4f9cf9',
			showGrid: true,
			trailPoints: 500,
			showOrbitPath: true,
			inclination: 51.6,
			period: 5400
		})
	);
	return { rootId, objects };
}

export function buildOrbitalViewISS(): GalleryVariantResult {
	const rootId = 'gallery-orbital-iss';
	const objects = new Map<string, MCSObject>();
	objects.set(
		rootId,
		obj(rootId, 'orbital-view', 'ISS Orbit Track', {
			gpsStreamId: 'sample:gps',
			showTrail: true,
			trailColor: '#f59e0b',
			showGrid: true,
			trailPoints: 800,
			showOrbitPath: true,
			inclination: 51.6,
			period: 5550
		})
	);
	return { rootId, objects };
}
