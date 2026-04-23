import { describe, it, expect } from 'vitest';
import {
	createLeaf,
	createSplit,
	getLeafObjectIds,
	cloneAndSetRatio,
	cloneAndSetLeaf,
	cloneAndSetLeafOrSplit,
	cloneRemoveLeaf
} from '../layout';
import type { LayoutNode } from '../types';

describe('layout', () => {
	describe('createLeaf', () => {
		it('creates leaf with objectId', () => {
			expect(createLeaf('obj-1')).toEqual({ kind: 'leaf', objectId: 'obj-1' });
		});
		it('creates empty leaf when objectId omitted', () => {
			expect(createLeaf()).toEqual({ kind: 'leaf', objectId: '' });
		});
	});

	describe('createSplit', () => {
		it('creates split with left and right', () => {
			const left = createLeaf('a');
			const right = createLeaf('b');
			const split = createSplit('horizontal', 0.5, left, right);
			expect(split.kind).toBe('split');
			if (split.kind === 'split') {
				expect(split.direction).toBe('horizontal');
				expect(split.ratio).toBe(0.5);
				expect(split.left).toBe(left);
				expect(split.right).toBe(right);
			}
		});
	});

	describe('getLeafObjectIds', () => {
		it('returns empty for empty leaf', () => {
			expect(getLeafObjectIds(createLeaf())).toEqual([]);
		});
		it('returns single id for leaf with objectId', () => {
			expect(getLeafObjectIds(createLeaf('x'))).toEqual(['x']);
		});
		it('returns all leaf ids in split', () => {
			const root = createSplit('horizontal', 0.5, createLeaf('a'), createLeaf('b'));
			expect(getLeafObjectIds(root)).toEqual(['a', 'b']);
		});
		it('returns all leaf ids in nested layout', () => {
			const inner = createSplit('vertical', 0.3, createLeaf('x'), createLeaf('y'));
			const root = createSplit('horizontal', 0.5, createLeaf('a'), inner);
			expect(getLeafObjectIds(root).sort()).toEqual(['a', 'x', 'y']);
		});
	});

	describe('cloneAndSetRatio', () => {
		it('updates ratio at path', () => {
			const root = createSplit('horizontal', 0.5, createLeaf('a'), createLeaf('b'));
			const next = cloneAndSetRatio(root, [], 0.7);
			expect(next.kind).toBe('split');
			if (next.kind === 'split') expect(next.ratio).toBe(0.7);
		});
		it('updates ratio at nested path', () => {
			const right = createSplit('vertical', 0.5, createLeaf('x'), createLeaf('y'));
			const root = createSplit('horizontal', 0.5, createLeaf('a'), right);
			const next = cloneAndSetRatio(root, ['right'], 0.25);
			expect((next as { right: LayoutNode }).right).toMatchObject({ kind: 'split', ratio: 0.25 });
		});
	});

	describe('cloneAndSetLeaf', () => {
		it('replaces root leaf', () => {
			const root = createLeaf('old');
			expect(cloneAndSetLeaf(root, [], 'new')).toEqual(createLeaf('new'));
		});
		it('replaces leaf at path', () => {
			const root = createSplit('horizontal', 0.5, createLeaf('a'), createLeaf('b'));
			const next = cloneAndSetLeaf(root, ['right'], 'c');
			expect(getLeafObjectIds(next)).toEqual(['a', 'c']);
		});
	});

	describe('cloneAndSetLeafOrSplit', () => {
		it('sets leaf in empty root', () => {
			const root = createLeaf();
			expect(cloneAndSetLeafOrSplit(root, [], 'x')).toEqual(createLeaf('x'));
		});
		it('splits when leaf already has objectId (default placement)', () => {
			const root = createLeaf('a');
			const next = cloneAndSetLeafOrSplit(root, [], 'b');
			expect(next.kind).toBe('split');
			expect(getLeafObjectIds(next)).toEqual(['a', 'b']);
		});
	});

	describe('cloneRemoveLeaf', () => {
		it('returns null when removing only leaf', () => {
			const root = createLeaf('a');
			expect(cloneRemoveLeaf(root, [])).toBeNull();
		});
		it('replaces split with sibling when removing one side', () => {
			const root = createSplit('horizontal', 0.5, createLeaf('a'), createLeaf('b'));
			expect(cloneRemoveLeaf(root, ['left'])).toEqual(createLeaf('b'));
			expect(cloneRemoveLeaf(root, ['right'])).toEqual(createLeaf('a'));
		});
		it('collapses nested split when inner leaf removed', () => {
			const right = createSplit('vertical', 0.5, createLeaf('x'), createLeaf('y'));
			const root = createSplit('horizontal', 0.5, createLeaf('a'), right);
			const next = cloneRemoveLeaf(root, ['right', 'left']);
			expect(next?.kind).toBe('split');
			expect(getLeafObjectIds(next!)).toEqual(['a', 'y']);
		});
	});
});
