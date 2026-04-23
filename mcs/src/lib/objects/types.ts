export type ObjectType =
	| 'project'
	| 'folder'
	| 'layout'
	| 'stack'
	| 'gauge'
	| 'grid-layout'
	| 'flex-layout'
	| 'line-plot'
	| 'bar-chart'
	| 'scatter-plot'
	| 'overlay-plot'
	| 'stacked-plot'
	| 'function-plot'
	| 'polar-plot'
	| 'plot-3d'
	| 'map-view'
	| 'clock'
	| 'timer'
	| 'time-strip'
	| 'telemetry-table'
	| 'image-view'
	| 'comms-log'
	| 'video-feed'
	| 'notification-display'
	| 'realtime-timeline'
	| 'gantt-chart'
	| 'notebook'
	| 'hyperlink'
	| 'iframe-embed'
	| 'condition-set'
	| 'summary-widget'
	| 'markdown-note'
	| 'orbital-view';

export interface MCSObjectBase {
	id: string;
	type: ObjectType;
	name: string;
	notes: string;
	createdAt: string;
	updatedAt: string;
}

/** Layout: binary split tree. Leaf = object ref (or empty slot), branch = split. */
export type LayoutNode =
	| { kind: 'leaf'; objectId?: string }
	| {
			kind: 'split';
			direction: 'horizontal' | 'vertical';
			ratio: number;
			left: LayoutNode;
			right: LayoutNode;
	  };

export interface LayoutProps {
	root?: LayoutNode;
}

export interface StackProps {
	objectIds?: string[];
	activeIndex?: number;
	/** Interval in seconds; 0 or undefined = no auto-cycling. */
	autoCycleSeconds?: number;
}

export type GaugeDisplayType = 'linear' | 'dial';

export interface GaugeProps {
	dataSource?: string;
	min?: number;
	max?: number;
	thresholdMin?: number;
	thresholdMax?: number;
	/** Second warning threshold (inner boundary). Values between warningMin–thresholdMin are caution. */
	warningMin?: number;
	/** Second warning threshold (inner boundary). Values between thresholdMax–warningMax are caution. */
	warningMax?: number;
	unit?: string;
	label?: string;
	/** Show the optional internal label inside the gauge. Default false. */
	showLabel?: boolean;
	displayType?: GaugeDisplayType;
	precision?: number;
	/** Major tick step (e.g. 10 = ticks at min, min+10, ...). Omit or 0 = no ticks. */
	tickStep?: number;
	/** Number of major divisions (e.g. 5 => 0, 25, 50, 75, 100). Used when tickStep is not set. */
	tickCount?: number;
	/** Fill/arc color in the normal operating zone. Default: #4f9cf9 */
	normalColor?: string;
	/** Fill/arc color in the caution/warning zone. Default: #f59e0b */
	warningColor?: string;
	/** Fill/arc color in the alarm/critical zone. Default: #ef4444 */
	alarmColor?: string;
	arcColor?: string;
	needleColor?: string;
	thresholdColor?: string;
	trackColor?: string;
	trackOpacity?: number;
	valueOpacity?: number;
	thresholdOpacity?: number;
	/** Show "Min:", "Max:", "Threshold min:", "Threshold max:" labels. Default true. */
	showRangeLabels?: boolean;
}

export interface GridLayoutItem {
	id: string;
	objectId: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface GridLayoutProps {
	gridSize?: [number, number];
	items?: GridLayoutItem[];
	dimensions?: [number, number];
	scaleToFit?: boolean;
}

/** Limit bands rendered as colored horizontal bands on charts. */
export interface LimitBands {
	/** Lower red threshold — values below this are critical. */
	redLow?: number;
	/** Upper red threshold — values above this are critical. */
	redHigh?: number;
	/** Lower yellow threshold. */
	yellowLow?: number;
	/** Upper yellow threshold. */
	yellowHigh?: number;
	/** Show the bands on the chart. Default true when any threshold is set. */
	showBands?: boolean;
}

/** A reference curve overlaid on a chart for comparison. */
export interface ReferenceLine {
	label?: string;
	color?: string;
	/** Line dash pattern. Default: 'dashed'. */
	style?: 'solid' | 'dashed' | 'dotted';
	/** constant: y = value. linear: y = slope*x + intercept. quadratic: y = a*x²+b*x+c. */
	type: 'constant' | 'linear' | 'quadratic';
	/** For constant type: the y value. */
	value?: number;
	/** For linear type. */
	slope?: number;
	/** For linear type. */
	intercept?: number;
	/** For quadratic type (a*x²). */
	a?: number;
	/** For quadratic type (b*x). */
	b?: number;
	/** For quadratic type (constant term c). */
	c?: number;
}

export interface LinePlotProps {
	dataSources?: string[];
	seriesNames?: string[];
	interpolation?: 'linear' | 'step' | 'smooth' | 'basis';
	showGrid?: boolean;
	colors?: string[];
	xAxis?: { label?: string; min?: number | string; max?: number | string };
	yAxis?: { label?: string; min?: number; max?: number };
	pollInterval?: number;
	/** Horizontal limit bands overlaid on the chart. */
	limitBands?: LimitBands;
	/** Reference curves (constant, linear, quadratic) drawn for comparison. */
	referenceLines?: ReferenceLine[];
}

export interface BarChartProps {
	dataSource?: string;
	xKey?: string;
	yKey?: string;
	orientation?: 'vertical' | 'horizontal';
	grouped?: boolean;
	stacked?: boolean;
	colors?: string[];
	xAxis?: { label?: string };
	yAxis?: { label?: string };
	pollInterval?: number;
}

export interface ScatterPlotProps {
	dataSources?: string[];
	xKey?: string;
	yKey?: string;
	markerSize?: number;
	colors?: string[];
	xAxis?: { label?: string };
	yAxis?: { label?: string };
	pollInterval?: number;
}

export interface OverlayPlotSeries {
	dataSource: string;
	type?: 'line' | 'scatter';
	name?: string;
	color?: string;
	interpolation?: 'linear' | 'step' | 'smooth' | 'basis';
	/** Which Y axis this series uses. Default: 'left'. */
	axis?: 'left' | 'right';
}

export interface OverlayPlotProps {
	series?: OverlayPlotSeries[];
	showGrid?: boolean;
	xAxis?: { label?: string };
	yAxis?: { label?: string; min?: number; max?: number };
	/** Optional independent right-side Y axis. Shown when at least one series has axis: 'right'. */
	yAxisRight?: { label?: string; min?: number; max?: number };
	pollInterval?: number;
	/** Reference curves drawn for comparison (e.g. ideal trajectory). */
	referenceLines?: ReferenceLine[];
}

export interface StackedPlotSeries {
	dataSource: string;
	name?: string;
	color?: string;
	interpolation?: 'linear' | 'step' | 'smooth' | 'basis';
}

export interface StackedPlotProps {
	series?: StackedPlotSeries[];
	showGrid?: boolean;
	xAxis?: { label?: string };
	pollInterval?: number;
}

export interface FunctionPlotProps {
	/** JS math expression. Variables: t (seconds in window), time (unix sec), i (index), pi, e. */
	expression?: string;
	/** Number of generated points for the visible window. */
	sampleCount?: number;
	/** Render color. */
	color?: string;
	/** Stroke width in px. */
	strokeWidth?: number;
	/** Toggle chart grid. */
	showGrid?: boolean;
	/** Y-axis label. */
	yAxisLabel?: string;
	/** Optional explicit y-domain min/max. */
	yMin?: number;
	yMax?: number;
}

export interface MapViewProps_Legacy {
	/** @deprecated use gpsStreamId */
	dataSource?: string;
	/** @deprecated use gpsStreamId */
	trailSource?: string;
	latitudeField?: string;
	longitudeField?: string;
	altitudeField?: string;
	/** Tile layer style. */
	baseLayer?: 'osm' | 'satellite' | 'topographic';
	/** Initial zoom level. */
	zoom?: number;
	/** Center override when no stream data. */
	defaultLat?: number;
	defaultLon?: number;
	/** Track rendering controls. */
	showTrail?: boolean;
	trailWindowSec?: number;
	trailMaxPoints?: number;
	autoFollow?: boolean;
	pathColor?: string;
	markerColor?: string;
	/** Orbit model preset for common LEO families. */
	orbitPreset?: 'custom' | 'iss' | 'starlink';
	/** Render a simple predicted orbit segment ahead of current position. */
	showPredictedOrbit?: boolean;
	/** Prediction horizon in seconds. */
	predictionWindowSec?: number;
	/** Estimated orbital period in seconds. */
	orbitPeriodSec?: number;
	/** Inclination used for synthetic prediction envelope. */
	inclinationDeg?: number;
	/** Ascending node offset in degrees. */
	ascendingNodeDeg?: number;
	/** Predicted path color. */
	predictionColor?: string;
}

export type TimerDirection = 'count-up' | 'count-down';

export type TimeStripSource = 'annotations' | 'limit-events' | 'all';

export interface TimeStripRow {
	/** Strip label shown on the left. */
	label?: string;
	/** Data source for this strip. */
	source: TimeStripSource;
	/** Whether to show this strip. Default true. */
	visible?: boolean;
}

export interface TimeStripProps {
	/** Whether to show annotations on the strip (legacy single-strip mode). */
	showAnnotations?: boolean;
	/** Multi-strip rows. When set, overrides legacy single-strip mode. */
	strips?: TimeStripRow[];
}

export type ImageViewMode = 'full' | 'grid' | 'library';

export interface ImageViewProps {
	/** Stream ID providing image URLs via a `url` field (and optional `caption`, `ts` fields). */
	dataSource?: string;
	/** Display mode. */
	mode?: ImageViewMode;
	/** Number of columns in grid mode. */
	gridColumns?: number;
	/** Max images to show. */
	maxImages?: number;
	/** Show timestamp overlay on images. */
	showTimestamp?: boolean;
	/** Show time delta between consecutive images. */
	showTimeDelta?: boolean;
	/** Poll interval in ms. */
	pollInterval?: number;
}

export interface TelemetryTableColumn {
	streamId: string;
	field?: string;
	label?: string;
	/** Warning threshold when the value drops to or below this number. */
	warningBelow?: number;
	/** Alarm threshold when the value drops to or below this number. */
	alarmBelow?: number;
	/** Warning threshold when the value rises to or above this number. */
	warningAbove?: number;
	/** Alarm threshold when the value rises to or above this number. */
	alarmAbove?: number;
}

export interface TelemetryTableProps {
	/** Columns: stream + field name to display. */
	columns?: TelemetryTableColumn[];
	/** Max rows to fetch (default 500). */
	rowLimit?: number;
}

export interface TimerProps {
	/** Target time (unix seconds). For count-down, timer runs until this time. */
	targetTime?: number;
	/** count-down = count down to target; count-up = count up from target (or 0). */
	direction?: TimerDirection;
	/** Display format: DDD hh:mm:ss or hh:mm:ss. */
	format?: 'full' | 'short';
	/** When true, timer is paused. */
	paused?: boolean;
	/** Unix seconds when timer was paused (used to show elapsed while paused). */
	pausedAt?: number;
}

// ─── Notification Display ─────────────────────────────────────────────────────

export type NotificationSeverityFilter = 'all' | 'red' | 'yellow' | 'info';
export type NotificationSourceFilter = 'all' | 'limit' | 'system' | 'ingest';

export interface NotificationDisplayProps {
	/** Which severity levels to show. Default 'all'. */
	severityFilter?: NotificationSeverityFilter;
	/** Which sources to show. Default 'all'. */
	sourceFilter?: NotificationSourceFilter;
	/** If set, only show notifications whose streamId matches this value. Empty = all. */
	streamFilter?: string;
	/** Show only unacknowledged notifications. Default false. */
	unackedOnly?: boolean;
	/** Maximum notifications to display in the list. Default 100. */
	maxItems?: number;
	/** Display label for the panel header. */
	label?: string;
}

// ─── Realtime Timeline ────────────────────────────────────────────────────────

export type RealtimeTimelineRowType = 'line-chart' | 'image-feed' | 'events';

export interface RealtimeTimelineRow {
	id: string;
	/** Row type. */
	type: RealtimeTimelineRowType;
	/** Human-readable row label shown in the left gutter. */
	label: string;
	/** Stream ID to visualize. */
	streamId: string;
	/** For line-chart: field name within the stream. Default 'value'. */
	field?: string;
	/** Row height in pixels. Default 80. */
	height?: number;
	/** Optional explicit y-axis min. */
	yMin?: number;
	/** Optional explicit y-axis max. */
	yMax?: number;
	/** Chart line color. */
	color?: string;
	/** Whether the row is visible. Default true. */
	visible?: boolean;
}

export interface RealtimeTimelineProps {
	rows?: RealtimeTimelineRow[];
	/** Width (in px) of the row label gutter on the left. Default 80. */
	gutterWidth?: number;
	/** Show a shared time axis at the bottom. Default true. */
	showTimeAxis?: boolean;
	/** If true, auto-scroll to latest data in realtime. Default true. */
	autoScroll?: boolean;
}

export interface PolarPlotSeries {
	/** Stream ID supplying angle (θ) values. */
	thetaSource: string;
	/** Stream ID supplying radius (r) values. */
	rSource: string;
	/** Whether theta values are in radians or degrees. Default 'radians'. */
	thetaUnit?: 'radians' | 'degrees';
	/** Connect consecutive (θ, r) points with a line. Default true. */
	connect?: boolean;
	name?: string;
	color?: string;
}

export interface PolarPlotProps {
	series?: PolarPlotSeries[];
	/** Minimum radius domain. Default 0. */
	rMin?: number;
	/** Maximum radius domain. Auto-computed if omitted. */
	rMax?: number;
	/** Number of concentric grid rings. Default 5. */
	gridRings?: number;
	/** Angle grid step in degrees. Default 30. */
	angleStep?: number;
	/** How to label the angle grid. 'degrees' | 'radians' | 'none'. Default 'degrees'. */
	angleLabels?: 'degrees' | 'radians' | 'none';
	/** Show dots at each data point. Default true. */
	showDots?: boolean;
	/** Show connecting line. Default true. */
	showLine?: boolean;
	/** Data window in seconds. Default 60. */
	windowSec?: number;
	/** Max points per series. Default 300. */
	pointsPerSeries?: number;
	pollInterval?: number;
}

export interface Plot3DSeries {
	/** Stream for X axis values. */
	xSource: string;
	/** Stream for Y axis values. */
	ySource: string;
	/** Stream for Z axis values (height/color). */
	zSource?: string;
	name?: string;
	color?: string;
	/** Marker radius. Default 4. */
	markerSize?: number;
}

export interface Plot3DProps {
	series?: Plot3DSeries[];
	xAxis?: { label?: string };
	yAxis?: { label?: string };
	zAxis?: { label?: string };
	/** Azimuth rotation in degrees. Default 30. Configurable via drag. */
	azimuth?: number;
	/** Elevation angle in degrees. Default 25. */
	elevation?: number;
	/** Grid color. */
	gridColor?: string;
	pollInterval?: number;
}

export interface MapViewProps {
	/** Tile layer. Default 'osm'. */
	baseLayer?: 'osm' | 'satellite' | 'topographic';
	/** Show or hide the basemap tile layer. Default true. */
	showBaseLayer?: boolean;
	/** Basemap opacity (0–1). Default 1. */
	baseLayerOpacity?: number;
	/** Initial zoom level. Default 13. */
	zoom?: number;
	/** Center latitude (overridden by GPS data center when available). */
	centerLat?: number;
	/** Center longitude. */
	centerLon?: number;
	/**
	 * Live GPS stream ID. When set, subscribes to the SSE stream for lat/lon/alt/speed.
	 * Expects samples with fields: lat, lon (required); alt, speed (optional).
	 * If not set, falls back to the built-in sample:gps stream.
	 */
	gpsStreamId?: string;
	/** Show GPS trail. Default true. */
	showGpsTrail?: boolean;
	/** Time window in seconds for GPS trail. Default 300. */
	trailWindowSec?: number;
	/** Max trail points to keep. Default 500. */
	trailMaxPoints?: number;
	/** Trail color (CSS color). Default '#4f9cf9'. */
	trailColor?: string;
	/** Show current position marker. Default true. */
	showMarker?: boolean;
	/** Poll interval in ms for sample streams. Default 5000. */
	pollInterval?: number;
	/** Show the click-to-inspect panel. Default true. */
	showInspector?: boolean;
	/** Auto-follow latest position when new data arrives. Default false. */
	autoFollow?: boolean;
	/** Optional raster overlay image (PNG/SVG/JPEG) rendered on top of the base layer. */
	overlayImageUrl?: string;
	/** Optional fallback overlay image URL used when `overlayImageUrl` 404s. */
	overlayImageUrlFallback?: string;
	/** Human-readable label for the overlay badge. */
	overlayLabel?: string;
	/**
	 * Optional legend gradient (CSS background value) for the overlay legend strip.
	 * If omitted, Map View will use a sensible default for known overlays (e.g. NDVI),
	 * or a neutral theme ramp otherwise.
	 */
	overlayLegendRampCss?: string;
	/**
	 * Optional left/low label for the overlay legend strip (e.g. "0.00" or "dry").
	 * If omitted, Map View will choose a default based on `overlayLabel`.
	 */
	overlayLegendMinLabel?: string;
	/**
	 * Optional right/high label for the overlay legend strip (e.g. "1.00" or "lush").
	 * If omitted, Map View will choose a default based on `overlayLabel`.
	 */
	overlayLegendMaxLabel?: string;
	/** Show or hide the raster overlay. Default true when an overlay is configured. */
	showOverlay?: boolean;
	/** Overlay opacity (0–1). Default 0.72. */
	overlayOpacity?: number;
	/** CSS blend mode applied to the raster overlay image. Default 'multiply'. */
	overlayBlendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
	/** South edge of the raster overlay bounds. */
	overlaySouth?: number;
	/** West edge of the raster overlay bounds. */
	overlayWest?: number;
	/** North edge of the raster overlay bounds. */
	overlayNorth?: number;
	/** East edge of the raster overlay bounds. */
	overlayEast?: number;
	/** Optional static mission waypoints rendered as markers. */
	waypoints?: MapWaypoint[];
	/** Draw a planned path through the waypoint list. Default true. */
	showWaypointPath?: boolean;
	/** Color for the planned waypoint path. Default '#f59e0b'. */
	waypointPathColor?: string;
	/** Opacity for the planned waypoint path (0–1). Default 0.9. */
	waypointPathOpacity?: number;
	/** Show permanent waypoint labels. Default false. */
	showWaypointLabels?: boolean;

	/**
	 * Example/demo-only: multiplier applied by certain example plugins to control mission speed.
	 * 1.0 = default; <1 slower; >1 faster.
	 */
	missionSpeed?: number;
}

export interface MapWaypoint {
	lat: number;
	lon: number;
	label?: string;
	detail?: string;
	color?: string;
	/** Marker radius in pixels. Default 5. */
	markerSize?: number;
}

export interface MCSObject extends MCSObjectBase {
	props: Record<string, unknown>;
}

export interface ObjectRow {
	id: string;
	type: string;
	parent_id: string | null;
	sort_order: number;
	name: string;
	notes: string;
	props: string;
	created_at: string;
	updated_at: string;
}

export function rowToObject(row: ObjectRow): MCSObject {
	return {
		id: row.id,
		type: row.type as ObjectType,
		name: row.name,
		notes: row.notes ?? '',
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		props: parseProps(row.props)
	};
}

function parseProps(raw: string): Record<string, unknown> {
	try {
		return JSON.parse(raw ?? '{}') as Record<string, unknown>;
	} catch {
		return {};
	}
}

export interface ObjectTreeNode extends MCSObject {
	children: ObjectTreeNode[];
}

// ── Visibility Rules (for scriptable layouts) ─────────────────────────────
/**
 * A rule that controls whether a layout pane is visible.
 * Evaluated against live stream data — if the rule evaluates false, the pane
 * is hidden and its sibling fills the space.
 */
export interface VisibilityRule {
	/** Stream ID to evaluate. */
	streamId: string;
	/** Comparison operator. */
	op: ConditionOp;
	/** Threshold value. */
	value?: number;
	/** Upper bound for 'between'. */
	value2?: number;
	/** How to combine with other rules on the same pane. Default 'and'. */
	join?: 'and' | 'or';
}

// ── Flexible Layout ───────────────────────────────────────────────────────
/**
 * A pane in a recursive flex/split layout tree.
 * type='leaf'  → shows one child object (objectId) or an empty drop target
 * type='split' → contains exactly two child panes, split H or V at ratio
 */
export interface FlexPane {
	id: string;
	type: 'leaf' | 'split';
	/** Only for type='leaf': the ID of the object rendered in this pane. */
	objectId?: string;
	/** Only for type='split': split direction (default 'horizontal' = left/right). */
	direction?: 'horizontal' | 'vertical';
	/** Only for type='split': fraction for first child, 0–1 (default 0.5). */
	ratio?: number;
	/** Only for type='split': the two child panes. */
	children?: [FlexPane, FlexPane];
	/** Optional visibility rules. If all evaluate false, pane is hidden. */
	visibilityRules?: VisibilityRule[];
	/** Optional CSS class to apply when visible. */
	cssClass?: string;
}

export interface FlexLayoutProps {
	/** Root of the pane tree. */
	root?: FlexPane;
}

// ── Gantt Chart ───────────────────────────────────────────────────────────

export interface GanttTask {
	id: string;
	label: string;
	start: number; // unix seconds
	end: number; // unix seconds
	color?: string;
	/** Optional parent task id for nested/grouped tasks. */
	parentId?: string;
	/** Completion percentage (0–100). */
	progress?: number;
}

export interface GanttChartProps {
	tasks?: GanttTask[];
	/** Show the "now" cursor line. Default true. */
	showNow?: boolean;
	/** Visible time window in seconds. Default 3600 (1 hour). */
	windowSec?: number;
	/** Row height in px. Default 28. */
	rowHeight?: number;
	/** Label gutter width in px. Default 120. */
	labelWidth?: number;
}

// ── Timestamped Notebook ──────────────────────────────────────────────────

export interface NotebookEntry {
	id: string;
	timestamp: number; // unix seconds
	text: string;
	author?: string;
	tags?: string[];
}

export interface NotebookProps {
	entries?: NotebookEntry[];
	/** Label for the notebook. */
	label?: string;
	/** Show tags column. Default true. */
	showTags?: boolean;
	/** Show author column. Default false. */
	showAuthor?: boolean;
	/** Sort newest first. Default true. */
	newestFirst?: boolean;
}

// ── Hyperlink ─────────────────────────────────────────────────────────────

export interface HyperlinkProps {
	/** URL to link to. */
	url?: string;
	/** Display text. Falls back to URL if empty. */
	displayText?: string;
	/** Optional icon name (lucide). */
	icon?: string;
	/** Open in new tab. Default true. */
	newTab?: boolean;
}

// ── Iframe Embed ──────────────────────────────────────────────────────────

export interface IframeEmbedProps {
	/** URL to embed. */
	url?: string;
	/** Sandbox restrictions. Default "allow-scripts allow-same-origin". */
	sandbox?: string;
	/** Title for accessibility. */
	title?: string;
}

// ── Condition Set / Logic Block ───────────────────────────────────────────

export type ConditionOp = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'between';

export interface Condition {
	id: string;
	/** Stream ID to evaluate. */
	streamId: string;
	/** Comparison operator. */
	op: ConditionOp;
	/** Threshold value (for gt/lt/gte/lte/eq/neq). */
	value?: number;
	/** Upper bound for 'between'. */
	value2?: number;
	/** Label for this condition. */
	label?: string;
	/** Output when true. */
	outputTrue?: string;
	/** Output when false. */
	outputFalse?: string;
	/** CSS color when true. */
	colorTrue?: string;
	/** CSS color when false. */
	colorFalse?: string;
}

export interface ConditionSetProps {
	conditions?: Condition[];
	/** Display mode: 'widget' shows a summary banner, 'table' shows all conditions. */
	mode?: 'widget' | 'table';
	/** Label for the condition set. */
	label?: string;
}

// ── Summary Widget ────────────────────────────────────────────────────────

export interface SummaryWidgetRule {
	streamId: string;
	label?: string;
	op: ConditionOp;
	/** Threshold value to compare against (preferred field — used by the view). */
	threshold?: number;
	/** Alias for threshold (legacy — prefer `threshold`). */
	value?: number;
	value2?: number;
	color?: string;
	message?: string;
}

export interface SummaryWidgetProps {
	rules?: SummaryWidgetRule[];
	/** Default label when all rules pass. */
	okLabel?: string;
	/** Optional secondary line when all rules pass. Empty string hides it. */
	okDetail?: string;
	/** Default color when all rules pass. */
	okColor?: string;
	/** Show the banner subtitle / detail line. Default true. */
	showDetail?: boolean;
	/** Display rules in configured order or grouped by active severity. Default 'configured'. */
	ruleOrder?: 'configured' | 'severity';
}

// ── Markdown Note ─────────────────────────────────────────────────────────

export interface MarkdownNoteProps {
	/** Markdown content. */
	content?: string;
}

// ── Clock (enhanced) ──────────────────────────────────────────────────────

export interface ClockZone {
	/** IANA timezone name. */
	timezone: string;
	/** Label shown above this clock. Empty = use timezone. */
	label?: string;
}

export interface ClockProps {
	/** IANA timezone (e.g. UTC, America/New_York). Empty = local. */
	timezone?: string;
	/** Show date as well as time. */
	showDate?: boolean;
	/** Use 12-hour format. */
	use12h?: boolean;
	/** Show analog clock face. */
	analog?: boolean;
	/** Additional world-clock zones. */
	worldClocks?: ClockZone[];
}

// ── Orbital View ──────────────────────────────────────────────────────────

export interface OrbitalViewProps {
	/** GPS stream to read lat/lon/alt from. */
	gpsStreamId?: string;
	/** Show ground track trail. Default true. */
	showTrail?: boolean;
	/** Trail color. Default '#4f9cf9'. */
	trailColor?: string;
	/** Show lat/lon grid lines. Default true. */
	showGrid?: boolean;
	/** Projection: 'equirectangular' or 'mercator'. Default 'equirectangular'. */
	projection?: 'equirectangular' | 'mercator';
	/** Number of trail points to keep. Default 500. */
	trailPoints?: number;
	/** Show orbit path prediction. Default false. */
	showOrbitPath?: boolean;
	/** Orbit inclination in degrees (for prediction). */
	inclination?: number;
	/** Orbit period in seconds (for prediction). */
	period?: number;
}
