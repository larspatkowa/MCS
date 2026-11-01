/**
 * In-memory notifier for stream updates and limit events. When ingest runs,
 * broadcast is called and all SSE subscribers for that project receive the event.
 *
 * Events are batched: individual `broadcastStreamEvent()` calls are coalesced
 * and flushed to listeners every BATCH_INTERVAL_MS (default 150ms). Under low
 * traffic (≤1 event per interval) the latency overhead is negligible; under
 * high traffic the number of SSE writes is capped at ~7/sec per connection
 * without dropping samples inside each delivery window.
 */
import type { LimitEvent } from './limits-db.js';

export interface StreamEvent {
	streamId: string;
	sourceId?: string;
	timestamp: number;
	values: Record<string, unknown>;
	/** Durable telemetry_history id, used as the SSE resume cursor. */
	eventId?: number;
	/** All samples coalesced into this delivery window, in timestamp order. */
	samples?: {
		timestamp: number;
		values: Record<string, unknown>;
		eventId?: number;
		sourceId?: string;
	}[];
}

export interface LimitBroadcastEvent {
	type: 'limit';
	event: LimitEvent;
}

type Listener = (event: StreamEvent) => void;
type LimitListener = (event: LimitBroadcastEvent) => void;

const listenersByProject = new Map<string, Set<Listener>>();
const limitListenersByProject = new Map<string, Set<LimitListener>>();

export function subscribeStreamEvents(projectId: string, listener: Listener): () => void {
	let set = listenersByProject.get(projectId);
	if (!set) {
		set = new Set();
		listenersByProject.set(projectId, set);
	}
	set.add(listener);
	return () => {
		set!.delete(listener);
		if (set!.size === 0) listenersByProject.delete(projectId);
	};
}

export function subscribeLimitEvents(projectId: string, listener: LimitListener): () => void {
	let set = limitListenersByProject.get(projectId);
	if (!set) {
		set = new Set();
		limitListenersByProject.set(projectId, set);
	}
	set.add(listener);
	return () => {
		set!.delete(listener);
		if (set!.size === 0) limitListenersByProject.delete(projectId);
	};
}

// ─── Batching ──────────────────────────────────────────────────────────────────

const BATCH_INTERVAL_MS = 150;

/** Per-project buffer: keeps ordered samples per streamId for one delivery window. */
const batchBuffers = new Map<string, Map<string, StreamEvent[]>>();
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const batchSampleCounts = new Map<string, number>();
const batchByteCounts = new Map<string, number>();
const MAX_BATCH_BUFFERED_EVENTS = 10_000;
const MAX_BATCH_BUFFERED_BYTES = 2 * 1024 * 1024;

function flushBatch(projectId: string): void {
	const timer = batchTimers.get(projectId);
	if (timer) clearTimeout(timer);
	batchTimers.delete(projectId);
	const buffer = batchBuffers.get(projectId);
	if (!buffer || buffer.size === 0) {
		batchSampleCounts.delete(projectId);
		batchByteCounts.delete(projectId);
		return;
	}
	const set = listenersByProject.get(projectId);
	if (!set || set.size === 0) {
		buffer.clear();
		batchSampleCounts.delete(projectId);
		batchByteCounts.delete(projectId);
		return;
	}
	// Deliver one compact event per stream while preserving every sample in the
	// delivery window. The single-event shape remains unchanged for low traffic.
	for (const events of buffer.values()) {
		if (events.length === 0) continue;
		const last = events[events.length - 1];
		const event: StreamEvent =
			events.length === 1
				? last
				: {
						streamId: last.streamId,
						sourceId: last.sourceId,
						timestamp: last.timestamp,
						values: last.values,
						eventId: last.eventId,
						samples: events.map((sample) => ({
							timestamp: sample.timestamp,
							values: sample.values,
							eventId: sample.eventId,
							sourceId: sample.sourceId
						}))
					};
		for (const listener of set) {
			try {
				listener(event);
			} catch {
				// ignore per-listener errors
			}
		}
	}
	buffer.clear();
	batchSampleCounts.delete(projectId);
	batchByteCounts.delete(projectId);
}

export function broadcastStreamEvent(
	projectId: string,
	streamId: string,
	timestamp: number,
	values: Record<string, unknown>,
	eventId?: number,
	sourceId = 'legacy'
): void {
	const set = listenersByProject.get(projectId);
	if (!set || set.size === 0) return;

	let buffer = batchBuffers.get(projectId);
	if (!buffer) {
		buffer = new Map();
		batchBuffers.set(projectId, buffer);
	}
	const sampleBytes =
		Buffer.byteLength(JSON.stringify({ streamId, sourceId, timestamp, values, eventId }), 'utf8') +
		32;
	if (
		(batchSampleCounts.get(projectId) ?? 0) >= MAX_BATCH_BUFFERED_EVENTS ||
		(batchByteCounts.get(projectId) ?? 0) + sampleBytes > MAX_BATCH_BUFFERED_BYTES
	) {
		flushBatch(projectId);
	}
	let events = buffer.get(streamId);
	if (!events) {
		events = [];
		buffer.set(streamId, events);
	}
	events.push({
		streamId,
		sourceId,
		timestamp,
		values,
		...(eventId === undefined ? {} : { eventId })
	});
	batchSampleCounts.set(projectId, (batchSampleCounts.get(projectId) ?? 0) + 1);
	batchByteCounts.set(projectId, (batchByteCounts.get(projectId) ?? 0) + sampleBytes);

	if (!batchTimers.has(projectId)) {
		batchTimers.set(
			projectId,
			setTimeout(() => flushBatch(projectId), BATCH_INTERVAL_MS)
		);
	}
}

export function broadcastLimitEvent(projectId: string, event: LimitEvent): void {
	const set = limitListenersByProject.get(projectId);
	if (!set) return;
	const msg: LimitBroadcastEvent = { type: 'limit', event };
	for (const listener of set) {
		try {
			listener(msg);
		} catch {
			// ignore per-listener errors
		}
	}
}
