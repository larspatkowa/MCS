/** Defaults for the small set of object types exposed by the built-in registry. */
export function getDefaultPropsForType(type: string): Record<string, unknown> {
	switch (type) {
		case 'project':
		case 'folder':
			return {};
		case 'grid-layout':
			return {
				gridSize: [24, 24],
				items: [],
				dimensions: undefined,
				scaleToFit: true,
				backgroundMode: 'theme',
				backgroundColor: '#202020',
				showGrid: true,
				showChrome: true
			};
		case 'flex-layout':
			return { root: { id: 'root', type: 'leaf' } };
		case 'line-plot':
			return {
				dataSources: [],
				seriesNames: [],
				interpolation: 'linear',
				showGrid: true,
				pollInterval: 1000,
				xAxis: { label: 'UTC time' },
				// An empty label lets the axis show the series unit.
				yAxis: { label: '' }
			};
		case 'gauge':
			return {
				pollInterval: 1000,
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
		case 'telemetry-table':
			return { columns: [], rowLimit: 500 };
		case 'markdown-note':
			return { content: '# Notes\n\nAdd documentation or procedures here.' };
		case 'image':
			return { assetId: '', label: 'Image', fit: 'contain' };
		case 'video-stream':
			return {
				assetId: '',
				runId: '',
				label: 'Video',
				muted: true,
				showOverlay: true,
				autoplay: true,
				fit: 'contain',
				controls: true,
				volume: 1
			};
		case 'values-table':
			return { dataSources: [], fields: '', precision: 3, staleAfterSec: 5 };
		case 'mission-clock':
			return { label: 'Mission clock', t0: null, heldSeconds: null, showControls: true };
		case 'event-log':
			return { lookbackHours: 24, showNotes: true };
		case 'ground-track':
			return {
				dataSource: '',
				latField: 'lat',
				lonField: 'lon',
				altField: 'alt',
				padLat: null,
				padLon: null,
				windowSec: 3600
			};
		case 'scatter-plot':
			return {
				xSource: '',
				xField: 'value',
				ySource: '',
				yField: 'value',
				windowSec: 600,
				connect: true
			};
		case 'tabs':
			return {};
		case 'stack':
			return { minRowHeight: 180, showTitles: true };
		case 'web-page':
			return { url: '', label: '' };
		default:
			// Legacy object types remain readable as unknown objects, but are not
			// creatable and receive no feature-specific defaults.
			return {};
	}
}
