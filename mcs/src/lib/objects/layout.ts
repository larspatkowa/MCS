import type { LayoutNode } from './types.js';

export function createLeaf(objectId?: string): LayoutNode {
	return { kind: 'leaf', objectId: objectId ?? '' };
}

export function createSplit(
	direction: 'horizontal' | 'vertical',
	ratio: number,
	left: LayoutNode,
	right: LayoutNode
): LayoutNode {
	return { kind: 'split', direction, ratio, left, right };
}

export function getLeafObjectIds(node: LayoutNode): string[] {
	if (node.kind === 'leaf') return node.objectId ? [node.objectId] : [];
	return [...getLeafObjectIds(node.left), ...getLeafObjectIds(node.right)];
}

export type LayoutPathStep = 'left' | 'right';

/** Where to place a new pane when splitting: which side of the existing pane. */
export type LayoutPlacement = 'left' | 'right' | 'top' | 'bottom';

export function cloneAndSetRatio(
	root: LayoutNode,
	path: LayoutPathStep[],
	ratio: number
): LayoutNode {
	if (path.length === 0) {
		if (root.kind !== 'split') return root;
		return { ...root, ratio };
	}
	const [step, ...rest] = path;
	if (root.kind !== 'split') return root;
	const left = step === 'left' ? cloneAndSetRatio(root.left, rest, ratio) : root.left;
	const right = step === 'right' ? cloneAndSetRatio(root.right, rest, ratio) : root.right;
	return { ...root, left, right };
}

export function cloneAndSetDirection(
	root: LayoutNode,
	path: LayoutPathStep[],
	direction: 'horizontal' | 'vertical'
): LayoutNode {
	if (path.length === 0) {
		if (root.kind !== 'split') return root;
		return { ...root, direction };
	}
	const [step, ...rest] = path;
	if (root.kind !== 'split') return root;
	const left = step === 'left' ? cloneAndSetDirection(root.left, rest, direction) : root.left;
	const right = step === 'right' ? cloneAndSetDirection(root.right, rest, direction) : root.right;
	return { ...root, left, right };
}

export function cloneAndSetLeaf(
	root: LayoutNode,
	path: LayoutPathStep[],
	objectId: string
): LayoutNode {
	if (path.length === 0) return { kind: 'leaf', objectId };
	const [step, ...rest] = path;
	if (root.kind !== 'split') return root;
	const left = step === 'left' ? cloneAndSetLeaf(root.left, rest, objectId) : root.left;
	const right = step === 'right' ? cloneAndSetLeaf(root.right, rest, objectId) : root.right;
	return { ...root, left, right };
}

/** Set leaf at path; if that pane is already a leaf with an objectId, split it 50/50 instead. */
export function cloneAndSetLeafOrSplit(
	root: LayoutNode,
	path: LayoutPathStep[],
	objectId: string,
	placement?: LayoutPlacement
): LayoutNode {
	if (path.length === 0) {
		if (root.kind === 'leaf' && (root.objectId ?? '') && placement) {
			const existing = root;
			const newLeaf = createLeaf(objectId);
			switch (placement) {
				case 'left':
					return createSplit('horizontal', 0.5, newLeaf, existing);
				case 'right':
					return createSplit('horizontal', 0.5, existing, newLeaf);
				case 'top':
					return createSplit('vertical', 0.5, newLeaf, existing);
				case 'bottom':
					return createSplit('vertical', 0.5, existing, newLeaf);
			}
		}
		if (root.kind === 'leaf' && (root.objectId ?? '')) {
			return createSplit('horizontal', 0.5, root, createLeaf(objectId));
		}
		return createLeaf(objectId);
	}
	const [step, ...rest] = path;
	if (root.kind !== 'split') return root;
	const left =
		step === 'left' ? cloneAndSetLeafOrSplit(root.left, rest, objectId, placement) : root.left;
	const right =
		step === 'right' ? cloneAndSetLeafOrSplit(root.right, rest, objectId, placement) : root.right;
	return { ...root, left, right };
}

/**
 * Remove the leaf at the given path and collapse the split (sibling takes parent's space).
 * Returns the new root, or null if the last leaf was removed.
 */
export function cloneRemoveLeaf(root: LayoutNode, path: LayoutPathStep[]): LayoutNode | null {
	if (path.length === 0) {
		if (root.kind === 'leaf') return null;
		return root;
	}
	if (root.kind !== 'split') return root;
	const [step, ...rest] = path;
	if (rest.length === 0) {
		// Remove direct child; replace this split with the sibling
		return step === 'left' ? root.right : root.left;
	}
	const newChild = cloneRemoveLeaf(step === 'left' ? root.left : root.right, rest);
	if (newChild === null) {
		// Subtree became empty; replace this split with the other sibling
		return step === 'left' ? root.right : root.left;
	}
	return step === 'left' ? { ...root, left: newChild } : { ...root, right: newChild };
}
