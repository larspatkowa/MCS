/**
 * Subscribes to project change SSE and invokes callbacks so the app can
 * invalidate selected object or refresh the tree when another client changes data.
 *
 * Reconnect strategy: exponential backoff starting at 1 s, capped at 30 s.
 * The returned dispose function permanently stops reconnection.
 */

export type ProjectChangeEvent =
	| { type: 'object-updated'; objectId: string }
	| { type: 'tree-changed' };

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export function startProjectSync(
	projectId: string,
	handlers: {
		getSelectedObjectId: () => string | null;
		onObjectUpdated: (objectId: string) => void;
		onTreeChanged: () => void;
	}
): () => void {
	const url = `/api/projects/${encodeURIComponent(projectId)}/changes`;
	let es: EventSource | null = null;
	let disposed = false;
	let reconnectDelay = MIN_RECONNECT_MS;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function connect() {
		if (disposed) return;
		es = new EventSource(url);

		es.onmessage = (e: MessageEvent) => {
			// Successful message — reset backoff
			reconnectDelay = MIN_RECONNECT_MS;
			try {
				const data = JSON.parse(e.data) as ProjectChangeEvent;
				if (data.type === 'object-updated') {
					const selectedId = handlers.getSelectedObjectId();
					if (selectedId === data.objectId) {
						handlers.onObjectUpdated(data.objectId);
					}
				} else if (data.type === 'tree-changed') {
					handlers.onTreeChanged();
				}
			} catch {
				// ignore parse errors and heartbeat comments
			}
		};

		es.onerror = () => {
			es?.close();
			es = null;
			if (disposed) return;
			const delay = reconnectDelay;
			reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
			reconnectTimer = setTimeout(connect, delay);
		};
	}

	connect();

	return () => {
		disposed = true;
		if (reconnectTimer !== null) clearTimeout(reconnectTimer);
		es?.close();
		es = null;
	};
}
