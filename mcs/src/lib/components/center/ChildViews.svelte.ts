import { fromStore } from 'svelte/store';
import { explorerTree } from '$lib/stores/explorerTree.js';
import { findNodeById } from '$lib/objects';
import type { ObjectTreeNode } from '$lib/objects/types.js';

/** Tree children of a container object, in tree order. */
export function useChildObjects(objectId: () => string) {
	const tree = fromStore(explorerTree);
	const children = $derived.by((): ObjectTreeNode[] => {
		const root = tree.current;
		if (!root) return [];
		return findNodeById(root, objectId())?.children ?? [];
	});
	return {
		get children() {
			return children;
		}
	};
}
