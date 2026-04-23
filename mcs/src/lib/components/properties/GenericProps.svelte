<script lang="ts">
	import type { MCSObject } from '$lib/objects/types.js';
	import { currentProject, invalidateSelectedObject } from '$lib/stores/project';
	import { getSampleStreamOptions } from '$lib/charts/sample-streams.js';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';
	import PropText from './PropText.svelte';
	import PropTextarea from './PropTextarea.svelte';
	import PropSelect from './PropSelect.svelte';
	import PropCheckbox from './PropCheckbox.svelte';
	import PropColor from './PropColor.svelte';
	import PropMultiStream from './PropMultiStream.svelte';
	import PropSeriesList, { type SeriesItem } from './PropSeriesList.svelte';

	let { object }: { object: MCSObject } = $props();

	const sampleStreams = getSampleStreamOptions();

	// Whether to expose sample (synthetic) streams in dropdowns. Off by default
	// so real plugin streams are easier to find.
	let showSamples = $state(false);

	// Live streams declared by plugins, fetched from the project API.
	let projectStreams = $state<{ id: string; name: string }[]>([]);

	$effect(() => {
		const proj = $currentProject;
		if (!proj) return;
		if (false) {
			projectStreams = [];
			return;
		}
		fetch(`/api/projects/${proj.id}/streams`)
			.then((r) => (r.ok ? r.json() : []))
			.then((list: { id: string; name?: string; metadata?: { name?: string } }[]) => {
				projectStreams = list.map((s) => ({
					id: s.id,
					name: s.metadata?.name ?? s.name ?? s.id
				}));
			})
			.catch(() => {
				projectStreams = [];
			});
	});

	// Combined dropdown options: optionally include sample streams.
	const streamOptions = $derived.by(() => {
		const sampleIds = new Set(sampleStreams.map((s) => s.id));
		const liveOpts = projectStreams
			.filter((s) => !sampleIds.has(s.id))
			.map((s) => ({ value: s.id, label: s.name }));
		if (showSamples) {
			const sampleOpts = sampleStreams.map((s) => ({ value: s.id, label: `[Sample] ${s.name}` }));
			return [{ value: '', label: '(none)' }, ...liveOpts, ...sampleOpts];
		}
		return [{ value: '', label: '(none)' }, ...liveOpts];
	});

	// Metadata labels for known props
	const LABELS: Record<string, string> = {
		dataSource: 'Data Source',
		dataSources: 'Data Sources',
		series: 'Series',
		gpsStreamId: 'GPS Stream',
		streamId: 'Stream ID',
		min: 'Minimum',
		max: 'Maximum',
		unit: 'Unit',
		label: 'Label',
		showLabel: 'Show Internal Label',
		precision: 'Decimal Places',
		displayType: 'Display Type',
		showGrid: 'Show Grid',
		pollInterval: 'Poll Interval (ms)',
		pollMs: 'Poll Interval (ms)',
		interpolation: 'Interpolation',
		baseLayer: 'Base Layer',
		showBaseLayer: 'Show Basemap',
		baseLayerOpacity: 'Basemap Opacity',
		zoom: 'Zoom Level',
		showTrail: 'Show Trail',
		showGpsTrail: 'Show Trail',
		trailColor: 'Trail Color',
		trailPoints: 'Trail Points',
		trailWindowSec: 'Trail Window (sec)',
		trailMaxPoints: 'Trail Max Points',
		showOrbitPath: 'Show Orbit Path',
		inclination: 'Inclination (°)',
		period: 'Period (sec)',
		showMarker: 'Show Marker',
		autoFollow: 'Auto Follow',
		showInspector: 'Show Inspector',
		centerLat: 'Center Latitude',
		centerLon: 'Center Longitude',
		overlayImageUrl: 'Overlay Image URL',
		overlayLabel: 'Overlay Label',
		overlayLegendMinLabel: 'Legend Min Label',
		overlayLegendMaxLabel: 'Legend Max Label',
		overlayLegendRampCss: 'Legend Ramp CSS',
		showOverlay: 'Show Overlay',
		overlayOpacity: 'Overlay Opacity',
		overlayBlendMode: 'Overlay Blend Mode',
		overlaySouth: 'Overlay South',
		overlayWest: 'Overlay West',
		overlayNorth: 'Overlay North',
		overlayEast: 'Overlay East',
		showWaypointPath: 'Show Waypoint Path',
		waypointPathColor: 'Waypoint Path Color',
		waypointPathOpacity: 'Waypoint Path Opacity',
		showWaypointLabels: 'Show Waypoint Labels',
		missionSpeed: 'Mission Speed',
		timezone: 'Timezone',
		showDate: 'Show Date',
		use12h: '12-Hour Format',
		url: 'URL',
		displayText: 'Display Text',
		newTab: 'Open in New Tab',
		sandbox: 'Sandbox Policy',
		title: 'Title',
		content: 'Content',
		showRangeLabels: 'Show Range Labels',
		trackOpacity: 'Track Opacity',
		thresholdOpacity: 'Threshold Opacity',
		thresholdMin: 'Low Threshold',
		thresholdMax: 'High Threshold',
		warningMin: 'Low Warning',
		warningMax: 'High Warning',
		normalColor: 'Normal Color',
		warningColor: 'Warning Color',
		alarmColor: 'Alarm Color',
		arcColor: 'Arc Color',
		needleColor: 'Needle Color',
		thresholdColor: 'Threshold Color',
		trackColor: 'Track Color',
		tickStep: 'Tick Step',
		tickCount: 'Tick Count',
		orientation: 'Orientation',
		grouped: 'Grouped',
		stacked: 'Stacked',
		markerSize: 'Marker Size',
		showDots: 'Show Dots',
		showLine: 'Show Lines',
		windowSec: 'Window (sec)',
		gridRings: 'Grid Rings',
		angleStep: 'Angle Step',
		angleLabels: 'Angle Labels',
		rowLimit: 'Row Limit',
		showNow: 'Show Current Time',
		rowHeight: 'Row Height',
		labelWidth: 'Label Width',
		showTags: 'Show Tags',
		showAuthor: 'Show Author',
		newestFirst: 'Newest First',
		showTimestamp: 'Show Timestamp',
		mode: 'Mode',
		pathColor: 'Path Color',
		markerColor: 'Marker Color',
		showPredictedOrbit: 'Show Predicted Orbit',
		predictionWindowSec: 'Prediction Window (sec)',
		orbitPeriodSec: 'Orbit Period (sec)',
		inclinationDeg: 'Inclination (°)',
		ascendingNodeDeg: 'Ascending Node (°)',
		predictionColor: 'Prediction Color',
		orbitPreset: 'Orbit Preset',
		projection: 'Projection',
		scaleToFit: 'Scale to Fit',
		showAnnotations: 'Show Annotations',
		autoScroll: 'Auto Scroll',
		gutterWidth: 'Gutter Width',
		compactMode: 'Compact Mode',
		showDirection: 'Show Direction',
		showChannel: 'Show Channel',
		showCallsign: 'Show Callsign',
		filterDirection: 'Filter Direction',
		maxMessages: 'Max Messages',
		maxItems: 'Max Items',
		severityFilter: 'Severity Filter',
		sourceFilter: 'Source Filter',
		streamFilter: 'Stream Filter',
		unackedOnly: 'Unacknowledged Only',
		okDetail: 'OK Detail',
		autoCycleSeconds: 'Auto-Cycle (sec)',
		showTimeDelta: 'Show Time Delta',
		gridColumns: 'Grid Columns',
		maxImages: 'Max Images',
		muted: 'Muted',
		autoplay: 'Autoplay'
	};

	const DESCRIPTIONS: Record<string, string> = {
		dataSource: 'Pick the stream that supplies the value for this component.',
		dataSources: 'Choose the streams rendered together in this chart.',
		series: 'Configure each plotted series, including stream, label, and color.',
		gpsStreamId: 'Pick the telemetry stream that publishes lat/lon samples.',
		streamId: 'Stream ID used by this row or component.',
		min: 'Lower bound used for the displayed scale.',
		max: 'Upper bound used for the displayed scale.',
		unit: 'Suffix appended to rendered values.',
		label: 'Short label shown inside the component.',
		showLabel: 'Opt in to rendering the label inside the gauge body.',
		precision: 'How many decimal places to show.',
		displayType: 'Choose between a compact bar gauge and a dial gauge.',
		showGrid: 'Show or hide the chart background grid.',
		pollInterval: 'Refresh interval for sample data, in milliseconds.',
		baseLayer: 'Choose the basemap underneath telemetry and overlays.',
		showBaseLayer: 'Show or hide the basemap tile layer.',
		baseLayerOpacity: 'Opacity of the basemap tiles (0–1).',
		zoom: 'Saved map zoom level. Interactive zoom changes update this automatically.',
		showGpsTrail: 'Show the recent GPS breadcrumb trail.',
		trailColor: 'Color used for the live trail and marker accent.',
		trailWindowSec: 'How much recent trail history to keep on screen.',
		trailMaxPoints: 'Maximum number of trail points stored in memory.',
		showMarker: 'Show the latest GPS position as a marker.',
		autoFollow: 'Pan only when the tracked position drifts near the map edge.',
		showInspector: 'Enable click inspection on the rendered trail.',
		centerLat: 'Saved map center latitude.',
		centerLon: 'Saved map center longitude.',
		overlayImageUrl: 'Raster overlay image placed over the basemap.',
		overlayLabel: 'Short name shown in the map badge.',
		overlayLegendMinLabel: 'Override the left/low legend label (e.g. "0.00").',
		overlayLegendMaxLabel: 'Override the right/high legend label (e.g. "1.00").',
		overlayLegendRampCss:
			'Override the legend ramp background CSS (e.g. a linear-gradient). Leave blank to use defaults.',
		showOverlay: 'Show or hide the raster overlay.',
		overlayOpacity: 'Overlay opacity from transparent to solid.',
		overlayBlendMode: 'How the overlay mixes with the basemap imagery.',
		overlaySouth: 'Southern edge of the overlay bounds.',
		overlayWest: 'Western edge of the overlay bounds.',
		overlayNorth: 'Northern edge of the overlay bounds.',
		overlayEast: 'Eastern edge of the overlay bounds.',
		showWaypointPath: 'Draw the planned route through the waypoint list.',
		waypointPathColor: 'Color used for waypoint markers and the planned route.',
		waypointPathOpacity: 'Opacity of the planned waypoint path (0–1).',
		showWaypointLabels: 'Keep waypoint names visible on the map.',
		missionSpeed: 'Example projects may use this to slow down or speed up mission playback (1.0 = default).',
		showRangeLabels: 'Show numeric scale labels on the gauge.',
		trackOpacity: 'Opacity of the gauge background track.',
		thresholdOpacity: 'Opacity of warning and alarm bands.',
		thresholdMin: 'Alarm when the value drops to or below this level.',
		thresholdMax: 'Alarm when the value rises to or above this level.',
		warningMin: 'Warning when the value drops to or below this level.',
		warningMax: 'Warning when the value rises to or above this level.',
		normalColor: 'Color used while the value is in the normal band.',
		warningColor: 'Color used while the value is in the warning band.',
		alarmColor: 'Color used while the value is in the alarm band.',
		okDetail: 'Optional secondary line shown when no alert rule is active.',
		tickStep: 'Fixed distance between major tick marks.',
		tickCount: 'Approximate number of major tick marks to draw.',
		rowLimit: 'Maximum number of rows kept in the table.',
		gutterWidth: 'Width of the label gutter on the left side.',
		showTimeAxis: 'Show the shared time axis along the bottom.',
		autoScroll: 'Keep the newest data in view as rows arrive.',
		content: 'Markdown content saved in this note.',
		mode: 'Choose how this component presents its data.',
		gridColumns: 'Number of columns used by the image grid.',
		maxImages: 'Maximum number of recent images to keep visible.'
	};

	// Known dropdown options
	const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
		displayType: [
			{ value: 'linear', label: 'Linear (Bar)' },
			{ value: 'dial', label: 'Dial (Gauge)' }
		],
		interpolation: [
			{ value: 'linear', label: 'Linear' },
			{ value: 'step', label: 'Step' },
			{ value: 'smooth', label: 'Smooth' }
		],
		baseLayer: [
			{ value: 'osm', label: 'OpenStreetMap' },
			{ value: 'satellite', label: 'Satellite' },
			{ value: 'topographic', label: 'Topographic' }
		],
		overlayBlendMode: [
			{ value: 'normal', label: 'Normal' },
			{ value: 'multiply', label: 'Multiply' },
			{ value: 'screen', label: 'Screen' },
			{ value: 'overlay', label: 'Overlay' }
		],
		orientation: [
			{ value: 'vertical', label: 'Vertical' },
			{ value: 'horizontal', label: 'Horizontal' }
		],
		angleLabels: [
			{ value: 'degrees', label: 'Degrees' },
			{ value: 'radians', label: 'Radians' }
		],
		mode: [
			{ value: 'widget', label: 'Widget' },
			{ value: 'table', label: 'Table' },
			{ value: 'library', label: 'Library' }
		],
		projection: [
			{ value: 'equirectangular', label: 'Equirectangular' },
			{ value: 'mercator', label: 'Mercator' }
		],
		orbitPreset: [
			{ value: 'custom', label: 'Custom' },
			{ value: 'iss', label: 'ISS' },
			{ value: 'leo', label: 'Low Earth Orbit' },
			{ value: 'geo', label: 'Geostationary' }
		],
		filterDirection: [
			{ value: 'all', label: 'All' },
			{ value: 'uplink', label: 'Uplink' },
			{ value: 'downlink', label: 'Downlink' }
		],
		severityFilter: [
			{ value: 'all', label: 'All' },
			{ value: 'info', label: 'Info' },
			{ value: 'warning', label: 'Warning' },
			{ value: 'critical', label: 'Critical' }
		]
	};

	// ESSENTIAL fields — the most common / important per type
	const ESSENTIAL_KEYS: Record<string, string[]> = {
		gauge: [
			'dataSource',
			'min',
			'max',
			'unit',
			'label',
			'showLabel',
			'displayType',
			'precision',
			'thresholdMin',
			'thresholdMax'
		],
		'line-plot': ['dataSources', 'interpolation', 'showGrid', 'pollInterval'],
		'bar-chart': ['dataSource', 'orientation', 'showGrid', 'pollInterval'],
		'scatter-plot': ['dataSources', 'markerSize', 'showGrid', 'pollInterval'],
		'overlay-plot': ['series', 'showGrid', 'pollInterval'],
		'stacked-plot': ['series', 'showGrid', 'pollInterval'],
		'polar-plot': ['showDots', 'showLine', 'gridRings', 'windowSec', 'pollInterval'],
		'plot-3d': ['pollInterval'],
		'map-view': [
			'gpsStreamId',
			'baseLayer',
			'zoom',
			'showGpsTrail',
			'trailColor',
			'autoFollow',
			'showInspector',
			'overlayImageUrl',
			'overlayLabel',
			'overlayLegendMinLabel',
			'overlayLegendMaxLabel',
			'overlayLegendRampCss',
			'overlayOpacity',
			'overlayBlendMode',
			'showWaypointPath',
			'waypointPathColor',
			'waypointPathOpacity',
			'missionSpeed'
		],
		'orbital-view': [
			'gpsStreamId',
			'showGpsTrail',
			'trailColor',
			'showGrid',
			'showOrbitPath',
			'inclination',
			'period'
		],
		clock: ['timezone', 'showDate', 'use12h'],
		'telemetry-table': ['rowLimit'],
		'gantt-chart': ['showNow', 'windowSec', 'rowHeight'],
		notebook: ['showTags', 'showAuthor', 'newestFirst'],
		hyperlink: ['url', 'displayText', 'newTab'],
		'iframe-embed': ['url', 'sandbox', 'title'],
		'condition-set': ['mode', 'label'],
		'summary-widget': ['okLabel', 'okDetail', 'okColor'],
		'markdown-note': ['content']
	};

	// GPS-only stream options — shown for gpsStreamId pickers.
	// Includes any stream whose ID contains a GPS/location keyword, plus a catch-all
	// that also includes all live streams (so users can still pick anything they want).
	const gpsStreamOptions = $derived.by(() => {
		const GPS_RE = /gps|GPS|location|geo|nav|track|position/i;
		const liveOpts = projectStreams
			.filter((s) => !new Set(sampleStreams.map((x) => x.id)).has(s.id))
			.map((s) => ({ value: s.id, label: s.name }));
		const gpsOpts = liveOpts.filter((o) => GPS_RE.test(o.value));
		const otherOpts = liveOpts.filter((o) => !GPS_RE.test(o.value));
		if (showSamples) {
			const sampleGps = sampleStreams
				.filter((s) => GPS_RE.test(s.id))
				.map((s) => ({ value: s.id, label: `[Sample] ${s.name}` }));
			return [{ value: '', label: '(none)' }, ...gpsOpts, ...sampleGps, ...otherOpts];
		}
		return [{ value: '', label: '(none)' }, ...gpsOpts, ...otherOpts];
	});

	function isStreamField(key: string): boolean {
		return key === 'dataSource' || key === 'gpsStreamId' || key === 'streamId';
	}

	function isColorField(key: string): boolean {
		return key.toLowerCase().includes('color');
	}

	function getEditorType(
		key: string,
		val: unknown
	):
		| 'select'
		| 'stream'
		| 'multisource'
		| 'serieslist'
		| 'color'
		| 'boolean'
		| 'number'
		| 'textarea'
		| 'text'
		| 'skip' {
		if (key === 'overlayLegendRampCss') return 'textarea';
		if (key === 'dataSources') return 'multisource';
		if (key === 'series') return 'serieslist';
		if (
			key === 'conditions' ||
			key === 'rules' ||
			key === 'tasks' ||
			key === 'entries' ||
			key === 'items' ||
			key === 'objectIds' ||
			key === 'columns' ||
			key === 'strips' ||
			key === 'rows' ||
			key === 'xAxis' ||
			key === 'yAxis' ||
			key === 'zAxis' ||
			key === 'root' ||
			key === 'dimensions'
		)
			return 'skip';
		if (SELECT_OPTIONS[key]) return 'select';
		if (isStreamField(key)) return 'stream';
		if (isColorField(key)) return 'color';
		if (typeof val === 'boolean') return 'boolean';
		if (typeof val === 'number') return 'number';
		if (typeof val === 'string' && val.length > 80) return 'textarea';
		if (key === 'content') return 'textarea';
		if (typeof val === 'string') return 'text';
		return 'skip';
	}

	function getLabel(key: string): string {
		if (LABELS[key]) return LABELS[key];
		return key
			.replace(/([A-Z])/g, ' $1')
			.replace(/[_-]/g, ' ')
			.replace(/^\w/, (c) => c.toUpperCase())
			.trim();
	}

	function getDescription(key: string, label: string, editorType: string): string {
		if (DESCRIPTIONS[key]) return DESCRIPTIONS[key];
		if (editorType === 'boolean') return `Turn ${label.toLowerCase()} on or off.`;
		if (editorType === 'color') return `Pick the ${label.toLowerCase()}.`;
		return `Set ${label.toLowerCase()}.`;
	}

	function isEssential(key: string): boolean {
		const essentials = ESSENTIAL_KEYS[object.type];
		return essentials ? essentials.includes(key) : true;
	}

	const SERIES_TYPES = new Set(['overlay-plot', 'stacked-plot']);
	const DATASOURCES_TYPES = new Set(['line-plot', 'scatter-plot']);

	const propEntries = $derived.by(() => {
		const props = object.props ?? {};
		const entries = Object.entries(props)
			.map(([key, val]) => ({
				key,
				val,
				label: getLabel(key),
				editorType: getEditorType(key, val),
				advanced: !isEssential(key),
				tooltip: getDescription(key, getLabel(key), getEditorType(key, val))
			}))
			.filter((e) => e.editorType !== 'skip');

		// Inject synthetic 'series' entry for chart types that use it but don't have it stored yet
		if (SERIES_TYPES.has(object.type) && !props['series']) {
			entries.unshift({
				key: 'series',
				val: [],
				label: 'Series',
				editorType: 'serieslist',
				advanced: false,
				tooltip: DESCRIPTIONS.series
			});
		}
		// Inject synthetic 'dataSources' entry for chart types that use it but don't have it stored yet
		if (DATASOURCES_TYPES.has(object.type) && !props['dataSources']) {
			entries.unshift({
				key: 'dataSources',
				val: [],
				label: 'Data Sources',
				editorType: 'multisource',
				advanced: false,
				tooltip: DESCRIPTIONS.dataSources
			});
		}

		return entries;
	});

	async function updateProp(key: string, value: unknown) {
		const proj = $currentProject;
		if (!proj) return;
		if (false) return;
		const newProps = { ...object.props, [key]: value };
		const res = await fetch(`/api/projects/${proj.id}/objects/${object.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ props: newProps, expectedUpdatedAt: object.updatedAt })
		});
		if (res.ok || res.status === 409) invalidateSelectedObject();
	}
</script>

<PropSection title="Properties" id="generic-props" open={true} persistKey="mcs-props-section">
	{#each propEntries as entry (entry.key)}
		<PropRow label={entry.label} tooltip={entry.tooltip} advanced={entry.advanced}>
			{#if entry.editorType === 'select'}
				<PropSelect
					value={String(entry.val ?? '')}
					options={SELECT_OPTIONS[entry.key] ?? []}
					onChange={(v) => updateProp(entry.key, v)}
				/>
			{:else if entry.editorType === 'multisource'}
				<PropMultiStream
					values={Array.isArray(entry.val) ? (entry.val as string[]) : []}
					options={streamOptions}
					onChange={(v) => updateProp(entry.key, v)}
				/>
			{:else if entry.editorType === 'serieslist'}
				<PropSeriesList
					series={Array.isArray(entry.val) ? (entry.val as SeriesItem[]) : []}
					{streamOptions}
					showAxis={object.type === 'overlay-plot'}
					showType={object.type === 'overlay-plot'}
					onChange={(v) => updateProp(entry.key, v)}
				/>
			{:else if entry.editorType === 'stream'}
				<PropSelect
					value={String(entry.val ?? '')}
					options={entry.key === 'gpsStreamId' ? gpsStreamOptions : streamOptions}
					onChange={(v) => updateProp(entry.key, v)}
				/>
			{:else if entry.editorType === 'color'}
				<PropColor
					value={String(entry.val ?? '#4f9cf9')}
					onChange={(v) => updateProp(entry.key, v)}
				/>
			{:else if entry.editorType === 'boolean'}
				<PropCheckbox checked={Boolean(entry.val)} onChange={(v) => updateProp(entry.key, v)} />
			{:else if entry.editorType === 'number'}
				<PropNumber
					value={entry.val as number | undefined}
					onChange={(v) => updateProp(entry.key, v ?? 0)}
				/>
			{:else if entry.editorType === 'textarea'}
				<PropTextarea value={String(entry.val ?? '')} onChange={(v) => updateProp(entry.key, v)} />
			{:else}
				<PropText value={String(entry.val ?? '')} onChange={(v) => updateProp(entry.key, v)} />
			{/if}
		</PropRow>
	{/each}
	{#if propEntries.length === 0}
		<p class="no-props">No configurable properties.</p>
	{/if}
	<div class="sample-toggle-row">
		<label class="sample-toggle">
			<input type="checkbox" bind:checked={showSamples} />
			Show sample streams
		</label>
	</div>
</PropSection>

<style>
	.no-props {
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
		margin: 0;
	}

	.sample-toggle-row {
		padding: 6px 10px 4px;
		border-top: 1px solid var(--mcs-border, #2a2a2a);
		margin-top: 2px;
	}

	.sample-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--mcs-text-muted, #666);
		cursor: pointer;
		user-select: none;
	}

	.sample-toggle input[type='checkbox'] {
		cursor: pointer;
		accent-color: var(--mcs-accent, #4f9cf9);
	}

	.sample-toggle:hover {
		color: var(--mcs-text, #ccc);
	}
</style>
