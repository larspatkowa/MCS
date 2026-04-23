import { writable } from 'svelte/store';
import type { ObjectTreeNode } from '$lib/objects';

/** Tree currently shown in the Explorer. Set by ObjectTree when it loads. */
export const explorerTree = writable<ObjectTreeNode | null>(null);

/** Increment to request ObjectTree to reload the tree (e.g. after adding an object). */
export const explorerTreeRefresh = writable(0);

export function refreshExplorerTree(): void {
	explorerTreeRefresh.update((n) => n + 1);
}

/**
 * Set of object IDs that are additionally selected via Ctrl/Shift multi-select.
 * The primary selected object is tracked in `selectedObjectId` (project store).
 */
export const multiSelectedIds = writable<Set<string>>(new Set());

export function clearMultiSelect(): void {
	multiSelectedIds.set(new Set());
}

export function toggleMultiSelect(id: string): void {
	multiSelectedIds.update((s) => {
		const next = new Set(s);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	});
}
