import type { ObjectType } from './types.js';

/**
 * Sensible default props for new objects, used to pre-fill the create-object modal
 * and ensure new objects have consistent initial state.
 */
export function getDefaultPropsForType(type: ObjectType): Record<string, unknown> {
	switch (type) {
		case 'project':
			return {};
		case 'layout':
			return { root: null };
		case 'folder':
			return {};
		case 'stack':
			return { objectIds: [], activeIndex: 0, autoCycleSeconds: 0 };
		case 'gauge':
			return {
				min: 0,
				max: 100,
				unit: '',
				label: '',
				showLabel: false,
				dataSource: '',
				displayType: 'linear',
				precision: 2,
				showRangeLabels: true,
				trackOpacity: 0.6,
				thresholdOpacity: 0.5
			};
		case 'grid-layout':
			return {
				gridSize: [24, 24],
				items: [],
				dimensions: undefined,
				scaleToFit: true
			};
		case 'line-plot':
			return {
				dataSources: [],
				seriesNames: [],
				interpolation: 'linear',
				showGrid: true,
				pollInterval: 5000,
				xAxis: { label: 'UTC time' },
				yAxis: { label: 'Value' }
			};
		case 'bar-chart':
			return {
				dataSource: 'sample:sine',
				dataSources: ['sample:sine'],
				xKey: '',
				yKey: '',
				orientation: 'vertical',
				grouped: false,
				stacked: false,
				showGrid: true,
				pollInterval: 5000,
				xAxis: { label: 'Time bucket' },
				yAxis: { label: 'Average value' }
			};
		case 'scatter-plot':
			return {
				dataSources: [],
				xKey: '',
				yKey: '',
				markerSize: 4,
				showGrid: true,
				pollInterval: 5000,
				xAxis: { label: 'X value' },
				yAxis: { label: 'Y value' }
			};
		case 'overlay-plot':
			return {
				series: [],
				showGrid: true,
				pollInterval: 5000,
				xAxis: { label: 'UTC time' },
				yAxis: { label: 'Value' }
			};
		case 'stacked-plot':
			return {
				series: [],
				showGrid: true,
				pollInterval: 5000
			};
		case 'map-view':
			return {
				dataSource: '',
				trailSource: '',
				latitudeField: 'lat',
				longitudeField: 'lon',
				altitudeField: 'alt',
				baseLayer: 'osm',
				zoom: 3,
				defaultLat: 0,
				defaultLon: 0,
				showTrail: true,
				trailWindowSec: 5400,
				trailMaxPoints: 500,
				autoFollow: true,
				pathColor: '#2dd4bf',
				markerColor: '#f97316',
				orbitPreset: 'custom',
				showPredictedOrbit: false,
				predictionWindowSec: 3600,
				orbitPeriodSec: 5550,
				inclinationDeg: 51.6,
				ascendingNodeDeg: 0,
				predictionColor: '#f59e0b',
				overlayImageUrl: '',
				overlayLabel: '',
				overlayOpacity: 0.72,
				overlayBlendMode: 'multiply',
				showWaypointPath: true,
				waypointPathColor: '#f59e0b',
				showWaypointLabels: false
			};
		case 'clock':
			return { timezone: '', showDate: true, use12h: false };
		case 'timer':
			return {
				targetTime: Math.floor(Date.now() / 1000) + 3600,
				direction: 'count-down',
				format: 'full',
				paused: false
			};
		case 'time-strip':
			return {
				showAnnotations: true,
				strips: [
					{ label: 'Events', source: 'annotations', visible: true },
					{ label: 'Limits', source: 'limit-events', visible: true }
				]
			};
		case 'telemetry-table':
			return { columns: [], rowLimit: 500 };
		case 'image-view':
			return {
				dataSource: '',
				mode: 'library',
				gridColumns: 3,
				maxImages: 20,
				showTimestamp: true,
				showTimeDelta: false,
				pollInterval: 5000
			};
		case 'comms-log':
			return {
				dataSource: '',
				label: 'Comms Log',
				maxMessages: 200,
				filterDirection: 'all',
				showTimestamp: true,
				showDirection: true,
				showChannel: true,
				showCallsign: true,
				compactMode: false
			};
		case 'video-feed':
			return {
				dataSource: '',
				label: 'Video Feed',
				muted: true,
				showOverlay: true,
				autoplay: true
			};
		case 'notification-display':
			return {
				severityFilter: 'all',
				sourceFilter: 'all',
				streamFilter: '',
				unackedOnly: false,
				maxItems: 100,
				label: 'Notifications'
			};
		case 'realtime-timeline':
			return {
				rows: [],
				gutterWidth: 90,
				showTimeAxis: true,
				autoScroll: true
			};
		case 'polar-plot':
			return {
				series: [
					{
						thetaSource: 'sample:angle',
						rSource: 'sample:velocity',
						thetaUnit: 'degrees',
						name: 'Velocity'
					},
					{
						thetaSource: 'sample:angle',
						rSource: 'sample:altitude',
						thetaUnit: 'degrees',
						name: 'Altitude'
					}
				],
				gridRings: 5,
				angleStep: 30,
				angleLabels: 'degrees',
				showDots: true,
				showLine: true,
				windowSec: 60,
				pollInterval: 1500
			};
		case 'plot-3d':
			return {
				series: [
					{
						xSource: 'sample:altitude',
						ySource: 'sample:velocity',
						zSource: 'sample:accel_z',
						name: 'Flight data'
					}
				],
				azimuth: 30,
				elevation: 22,
				pollInterval: 4000,
				xAxis: { label: 'Altitude' },
				yAxis: { label: 'Velocity' },
				zAxis: { label: 'Accel Z' }
			};
		case 'flex-layout':
			return {
				root: { id: 'root', type: 'leaf' }
			};
		case 'gantt-chart':
			return {
				tasks: [],
				showNow: true,
				windowSec: 3600,
				rowHeight: 32,
				labelWidth: 140
			};
		case 'notebook':
			return {
				entries: [],
				label: 'Notebook',
				showTags: true,
				showAuthor: true,
				newestFirst: true
			};
		case 'hyperlink':
			return {
				url: '',
				displayText: 'Link',
				icon: 'link',
				newTab: true
			};
		case 'iframe-embed':
			return {
				url: '',
				sandbox: 'allow-scripts allow-same-origin',
				title: 'Embedded Content'
			};
		case 'condition-set':
			return {
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
					}
				],
				mode: 'widget',
				label: 'Conditions'
			};
		case 'summary-widget':
			return {
				rules: [
					{
						streamId: 'sample:sine',
						op: 'gt',
						threshold: 0.9,
						label: 'CAUTION',
						color: '#f59e0b'
					},
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
			};
		case 'markdown-note':
			return {
				content:
					'# Mission Notes\n\nAdd documentation, procedures, or status updates here.\n\n- Use **Markdown** for formatting\n- Click the edit button to modify\n- Supports `code`, links, and lists'
			};
		case 'orbital-view':
			return {
				gpsStreamId: 'sample:gps',
				showTrail: true,
				trailColor: '#4f9cf9',
				showGrid: true,
				trailPoints: 500,
				showOrbitPath: false,
				inclination: 51.6,
				period: 5400
			};
		default:
			return {};
	}
}
