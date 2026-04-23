/**
 * In-memory notifier for stream updates and limit events. When ingest runs,
 * broadcast is called and all SSE subscribers for that project receive the event.
 *
 * Events are batched: individual `broadcastStreamEvent()` calls are coalesced
 * and flushed to listeners every BATCH_INTERVAL_MS (default 150ms). Under low
 * traffic (≤1 event per interval) the latency overhead is negligible; under
 * high traffic the number of SSE writes is capped at ~7/sec per connection.
 */
import type { LimitEvent } from './limits-db.js';

export interface StreamEvent {
	streamId: string;
	timestamp: number;
	values: Record<string, unknown>;
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

/** Per-project buffer: keeps only the latest event per streamId. */
const batchBuffers = new Map<string, Map<string, StreamEvent>>();
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();

function flushBatch(projectId: string): void {
	batchTimers.delete(projectId);
	const buffer = batchBuffers.get(projectId);
	if (!buffer || buffer.size === 0) return;
	const set = listenersByProject.get(projectId);
	if (!set || set.size === 0) {
		buffer.clear();
		return;
	}
	// Deliver each buffered event
	for (const event of buffer.values()) {
		for (const listener of set) {
			try {
				listener(event);
			} catch {
				// ignore per-listener errors
			}
		}
	}
	buffer.clear();
}

export function broadcastStreamEvent(
	projectId: string,
	streamId: string,
	timestamp: number,
	values: Record<string, unknown>
): void {
	const set = listenersByProject.get(projectId);
	if (!set || set.size === 0) return;

	let buffer = batchBuffers.get(projectId);
	if (!buffer) {
		buffer = new Map();
		batchBuffers.set(projectId, buffer);
	}
	// Overwrite previous event for this stream (latest wins)
	buffer.set(streamId, { streamId, timestamp, values });

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
