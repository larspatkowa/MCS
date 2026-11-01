/**
 * Public boundary for pluggable telemetry sources and historians.
 *
 * All numeric times in this contract are Unix seconds. Source time remains
 * alongside the normalized UTC event time so consumers can inspect clock
 * corrections and original source semantics.
 */

export const TELEMETRY_ENVELOPE_VERSION = 1 as const;
export const MAX_HISTORY_PAGE_SIZE = 10_000;
export const MAX_HISTORY_PAGE_BYTES = 8 * 1024 * 1024;

export type SourceTimeUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';

export interface SourceTimestamp {
	/** Original numeric timestamp; use a decimal string for integers beyond JS safe precision. */
	value: number | string;
	unit: SourceTimeUnit;
	/** Named time scale, for example UTC, TAI, or GPS. */
	timeSystem: string;
}

export type TelemetryValue =
	| string
	| number
	| boolean
	| null
	| TelemetryValue[]
	| {
			[key: string]: TelemetryValue;
	  };

export type TelemetryValues = Record<string, TelemetryValue>;

export type ClockQuality = 'excellent' | 'good' | 'degraded' | 'unknown';

export interface SampleQuality {
	clock?: ClockQuality;
	/** Estimated source-clock error in seconds, when known. */
	clockUncertaintySeconds?: number;
	/** Source-specific quality flags; consumers must preserve unknown flags. */
	flags?: string[];
}

export interface TimeNormalizationProvenance {
	method: string;
	/** Correction applied to the converted source time, in seconds. */
	correctionSeconds?: number;
	correctionId?: string;
}

export interface TelemetryProvenance {
	normalization?: TimeNormalizationProvenance;
	/** Provider/source-specific JSON-compatible provenance. */
	[key: string]: TelemetryValue | TimeNormalizationProvenance | undefined;
}

/** Canonical, versioned sample passed between providers and platform services. */
export interface TelemetrySample {
	version: typeof TELEMETRY_ENVELOPE_VERSION;
	sourceId: string;
	streamId: string;
	sourceTimestamp: SourceTimestamp;
	/** Server receive time as Unix seconds. */
	receivedAt: number;
	/** Normalized event time as Unix UTC seconds. */
	eventTimeUtc: number;
	/** Monotonic source sequence number when the source provides one. */
	sequence?: number;
	/** Stable source identity for safe retry and duplicate suppression. */
	idempotencyKey?: string;
	values: TelemetryValues;
	quality?: SampleQuality;
	provenance?: TelemetryProvenance;
}

export interface TelemetryFieldMetadata {
	key: string;
	name?: string;
	unit?: string;
	format?: string;
	description?: string;
	type?: 'number' | 'string' | 'boolean' | 'object' | 'array';
}

export interface TelemetryStreamMetadata {
	streamId: string;
	name: string;
	description?: string;
	fields?: TelemetryFieldMetadata[];
}

export interface TelemetrySourceMetadata {
	sourceId: string;
	name: string;
	description?: string;
	streams: TelemetryStreamMetadata[];
	/** Source's default time scale, if it is fixed for all streams. */
	timeSystem?: string;
}

export interface TelemetryProviderCapabilities {
	live: boolean;
	history: boolean;
	/** Provider can resume a live subscription using an opaque cursor. */
	resumableLive: boolean;
	resolutions: readonly TelemetryResolution[];
}

export type TelemetryResolution = 'latest' | 'minmax' | 'raw';

/** Every history request has finite time bounds and an explicit result cap. */
export interface TelemetryHistoryQuery {
	sourceId: string;
	streamId: string;
	/** Inclusive Unix UTC seconds. */
	from: number;
	/** Inclusive Unix UTC seconds; must be greater than `from`. */
	to: number;
	resolution: TelemetryResolution;
	/** Numeric value field used for min/max reduction; required for minmax. */
	field?: string;
	/** Maximum samples returned by this page; must be between 1 and MAX_HISTORY_PAGE_SIZE. */
	maxSamples: number;
	/** Opaque paging cursor returned by a prior query. */
	pageCursor?: string;
}

export interface TelemetryHistoryPage {
	samples: TelemetrySample[];
	/** Present only when more samples remain within the original time bounds. */
	nextPageCursor?: string;
}

export interface TelemetryLiveSubscription {
	sourceId: string;
	streamIds?: readonly string[];
	/** Opaque cursor from a prior live event, used to resume without a gap. */
	afterCursor?: string;
	signal?: AbortSignal;
}

export interface TelemetryGapEvent {
	type: 'gap';
	sourceId: string;
	streamId?: string;
	firstMissingSequence?: number;
	lastMissingSequence?: number;
	observedAt: number;
	reason: 'sequence-gap' | 'buffer-overflow' | 'source-disconnect' | 'unknown';
}

export interface TelemetrySourceStatusEvent {
	type: 'source-status';
	sourceId: string;
	status: 'connected' | 'disconnected' | 'stale' | 'error';
	observedAt: number;
	message?: string;
}

export type TelemetryLiveEvent =
	| { type: 'sample'; sample: TelemetrySample; cursor: string }
	| { type: 'gap'; event: TelemetryGapEvent; cursor: string }
	| { type: 'source-status'; event: TelemetrySourceStatusEvent; cursor: string };

/**
 * Adapter boundary for live and historical telemetry sources.
 *
 * Implementations must reject invalid/non-finite query bounds, preserve the
 * caller's bounds across cursor pages, and ensure each response is no larger
 * than `maxSamples`. Provider-specific authorization is handled by the host.
 */
export interface TelemetryProvider {
	readonly id: string;
	getCapabilities(): TelemetryProviderCapabilities;
	getMetadata(sourceId?: string, signal?: AbortSignal): Promise<TelemetrySourceMetadata[]>;
	query(query: TelemetryHistoryQuery, signal?: AbortSignal): Promise<TelemetryHistoryPage>;
	subscribe(request: TelemetryLiveSubscription): AsyncIterable<TelemetryLiveEvent>;
}

/**
 * A host-defined authorization result passed to a future command adapter.
 * MCS ships no command registry, route, or executor until a real adapter and
 * its safety policy are designed and reviewed.
 */
export interface VehicleCommandContext<Authorization> {
	projectId: string;
	actorUserId: string;
	idempotencyKey: string;
	authorization: Authorization;
	signal?: AbortSignal;
}

/** Typed future extension point only; no built-in MCS code calls this. */
export interface VehicleCommandProvider<Command, Result, Authorization = unknown> {
	readonly id: string;
	execute(command: Command, context: VehicleCommandContext<Authorization>): Promise<Result>;
}

/** Read-side telemetry provider registry; vehicle commands stay separate. */
export interface TelemetryProviderRegistry {
	getProvider(providerId: string): TelemetryProvider | undefined;
	listProviders(): readonly TelemetryProvider[];
}
