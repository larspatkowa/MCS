import { writable } from 'svelte/store';
import type { ObjectTreeNode } from '$lib/objects';

/** Tree currently shown in the Explorer. Set by ObjectTree when it loads. */
export const explorerTree = writable<ObjectTreeNode | null>(null);

/** Increment to request ObjectTree to reload the tree (e.g. after adding an object). */
export const explorerTreeRefresh = writable(0);

export function refreshExplorerTree(): void {
	explorerTreeRefresh.update((n) => n + 1);
}
