/**
 * Shared SSE manager.  One EventSource connection per project is opened and
 * reused by all subscribing components.  Callers use `subscribeSSE()` to
 * register a handler for a specific stream (or `'*'` for all streams).
 *
 * When the last subscriber for a project disconnects the connection is torn
 * down automatically.
 */


export interface SSEStreamEvent {
	streamId: string;
	timestamp: number;
	values: Record<string, unknown>;
}

export interface SSELimitEvent {
	type: 'limit';
	event: {
		streamId: string;
		field: string;
		level: string;
		value: number;
		threshold: number;
		timestamp: number;
	};
}

export type SSEEvent = SSEStreamEvent | SSELimitEvent;
export type SSEHandler = (event: SSEEvent) => void;

interface ProjectConnection {
	es: EventSource;
	handlers: Map<string, Set<SSEHandler>>; // streamId | '*' -> handlers
	refCount: number;
}

const connections = new Map<string, ProjectConnection>();

function getOrCreateConnection(projectId: string): ProjectConnection {
	let conn = connections.get(projectId);
	if (conn) return conn;

	const es = new EventSource(`/api/projects/${projectId}/streams/events`);
	conn = { es, handlers: new Map(), refCount: 0 };

	es.onmessage = (event) => {
		let parsed: SSEEvent;
		try {
			parsed = JSON.parse(event.data);
		} catch {
			return;
		}
		const c = connections.get(projectId);
		if (!c) return;

		// Deliver to wildcard subscribers
		const wildcardHandlers = c.handlers.get('*');
		if (wildcardHandlers) {
			for (const h of wildcardHandlers) {
				try {
					h(parsed);
				} catch {
					/* ignore */
				}
			}
		}

		// Deliver to stream-specific subscribers
		const streamId = 'streamId' in parsed ? parsed.streamId : undefined;
		if (streamId) {
			const streamHandlers = c.handlers.get(streamId);
			if (streamHandlers) {
				for (const h of streamHandlers) {
					try {
						h(parsed);
					} catch {
						/* ignore */
					}
				}
			}
		}
	};

	es.onerror = () => {
		// EventSource auto-reconnects; nothing else needed
	};

	connections.set(projectId, conn);
	return conn;
}

/**
 * Subscribe to SSE events for a given project.
 * @param projectId  The project to listen to
 * @param streamId   A specific stream id, or `'*'` for all streams
 * @param handler    Called for each matching event
 * @returns  An unsubscribe function — call it in cleanup / onDestroy
 */
export function subscribeSSE(projectId: string, streamId: string, handler: SSEHandler): () => void {
	if (typeof EventSource === 'undefined') return () => {};

	const conn = getOrCreateConnection(projectId);
	conn.refCount++;

	let set = conn.handlers.get(streamId);
	if (!set) {
		set = new Set();
		conn.handlers.set(streamId, set);
	}
	set.add(handler);

	return () => {
		const c = connections.get(projectId);
		if (!c) return;

		const s = c.handlers.get(streamId);
		if (s) {
			s.delete(handler);
			if (s.size === 0) c.handlers.delete(streamId);
		}

		c.refCount--;
		if (c.refCount <= 0) {
			c.es.close();
			connections.delete(projectId);
		}
	};
}
