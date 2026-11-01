/** Object types exposed by the built-in registry. Unknown strings remain readable as legacy data. */
export type BuiltInObjectType =
	| 'project'
	| 'folder'
	| 'grid-layout'
	| 'flex-layout'
	| 'line-plot'
	| 'gauge'
	| 'telemetry-table'
	| 'markdown-note'
	| 'image'
	| 'video-stream';

/** Stored projects may contain older object ids, so the database boundary is intentionally open. */
export type ObjectType = BuiltInObjectType | (string & {});

export interface MCSObjectBase {
	id: string;
	type: ObjectType;
	name: string;
	notes: string;
	createdAt: string;
	updatedAt: string;
}

/** Legacy binary layout helpers retained only for reading old projects. */
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

export type GaugeDisplayType = 'linear' | 'dial';

export interface GaugeProps {
	dataSource?: string;
	pollInterval?: number;
	min?: number;
	max?: number;
	thresholdMin?: number;
	thresholdMax?: number;
	warningMin?: number;
	warningMax?: number;
	unit?: string;
	label?: string;
	showLabel?: boolean;
	displayType?: GaugeDisplayType;
	precision?: number;
	tickStep?: number;
	tickCount?: number;
	normalColor?: string;
	warningColor?: string;
	alarmColor?: string;
	arcColor?: string;
	needleColor?: string;
	thresholdColor?: string;
	trackColor?: string;
	trackOpacity?: number;
	valueOpacity?: number;
	thresholdOpacity?: number;
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
	backgroundMode?: 'theme' | 'solid' | 'transparent';
	backgroundColor?: string;
	showGrid?: boolean;
	showChrome?: boolean;
}

export interface LimitBands {
	redLow?: number;
	redHigh?: number;
	yellowLow?: number;
	yellowHigh?: number;
	showBands?: boolean;
}

export interface ReferenceLine {
	label?: string;
	color?: string;
	style?: 'solid' | 'dashed' | 'dotted';
	type: 'constant' | 'linear' | 'quadratic';
	value?: number;
	slope?: number;
	intercept?: number;
	a?: number;
	b?: number;
	c?: number;
}

export interface LinePlotProps {
	dataSources?: string[];
	seriesNames?: string[];
	interpolation?: 'linear' | 'step' | 'smooth' | 'basis';
	showGrid?: boolean;
	colors?: string[];
	windowSec?: number;
	xAxis?: { label?: string; min?: number | string; max?: number | string };
	yAxis?: { label?: string; min?: number; max?: number };
	/** Axis for series in a second unit. Shown only when series units differ. */
	yAxisRight?: { label?: string; min?: number; max?: number };
	/** Per-series units, parallel to dataSources. Defaults to stream metadata. */
	units?: string[];
	pollInterval?: number;
	limitBands?: LimitBands;
	referenceLines?: ReferenceLine[];
}

export interface TelemetryTableColumn {
	streamId: string;
	field?: string;
	label?: string;
	warningBelow?: number;
	alarmBelow?: number;
	warningAbove?: number;
	alarmAbove?: number;
}

export interface TelemetryTableProps {
	columns?: TelemetryTableColumn[];
	rowLimit?: number;
}

export interface FlexPane {
	id: string;
	type: 'leaf' | 'split';
	objectId?: string;
	direction?: 'horizontal' | 'vertical';
	ratio?: number;
	children?: [FlexPane, FlexPane];
}

export interface FlexLayoutProps {
	root?: FlexPane;
}

export interface MarkdownNoteProps {
	content?: string;
}

export interface ImageProps {
	assetId?: string;
	label?: string;
	fit?: 'contain' | 'cover';
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
		const value: unknown = JSON.parse(raw ?? '{}');
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export interface ObjectTreeNode extends MCSObject {
	children: ObjectTreeNode[];
}
