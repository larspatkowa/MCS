import type { ObjectTreeNode } from './types.js';

/** Find a node in the tree by id. Returns null if not found. */
export function findNodeById(node: ObjectTreeNode, id: string): ObjectTreeNode | null {
	if (node.id === id) return node;
	for (const child of node.children ?? []) {
		const found = findNodeById(child, id);
		if (found) return found;
	}
	return null;
}

/** Find the parent of the node with the given id. Returns null if not found or if the node is the root. */
export function findParentById(tree: ObjectTreeNode, id: string): ObjectTreeNode | null {
	if (tree.id === id) return null;
	for (const child of tree.children ?? []) {
		if (child.id === id) return tree;
		const found = findParentById(child, id);
		if (found) return found;
	}
	return null;
}
