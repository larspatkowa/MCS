/**
 * In-memory event bus for project changes. Used to push SSE events to clients
 * when objects are created, updated, or deleted so other tabs/devices can refresh.
 */

export type ProjectChangeEvent =
	| { type: 'object-updated'; objectId: string }
	| { type: 'tree-changed' };

type Listener = (event: ProjectChangeEvent) => void;

const channels = new Map<string, Set<Listener>>();

function getChannel(projectId: string): Set<Listener> {
	let set = channels.get(projectId);
	if (!set) {
		set = new Set();
		channels.set(projectId, set);
	}
	return set;
}

/**
 * Subscribe to change events for a project. Returns an unsubscribe function.
 */
export function subscribe(projectId: string, callback: Listener): () => void {
	const set = getChannel(projectId);
	set.add(callback);
	return () => {
		set.delete(callback);
		if (set.size === 0) channels.delete(projectId);
	};
}

/**
 * Notify all subscribers for a project of a change.
 */
export function notify(projectId: string, event: ProjectChangeEvent): void {
	const set = channels.get(projectId);
	if (!set) return;
	for (const cb of set) {
		try {
			cb(event);
		} catch (e) {
			console.error('[project-changes] listener error:', e);
		}
	}
}
