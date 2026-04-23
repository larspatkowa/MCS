import { describe, it, expect } from 'vitest';
import { findNodeById, findParentById } from '../tree';
import type { ObjectTreeNode } from '../types';

function node(id: string, children: ObjectTreeNode[] = []): ObjectTreeNode {
	return {
		id,
		type: 'folder',
		name: id,
		notes: '',
		createdAt: '',
		updatedAt: '',
		props: {},
		children
	};
}

describe('tree', () => {
	describe('findNodeById', () => {
		it('returns root when id matches', () => {
			const root = node('root');
			expect(findNodeById(root, 'root')).toBe(root);
		});

		it('returns null when id not in tree', () => {
			const root = node('root', [node('a')]);
			expect(findNodeById(root, 'x')).toBeNull();
		});

		it('finds child node', () => {
			const child = node('child');
			const root = node('root', [child]);
			expect(findNodeById(root, 'child')).toBe(child);
		});

		it('finds nested node', () => {
			const deep = node('deep');
			const root = node('root', [node('a', [node('b', [deep])])]);
			expect(findNodeById(root, 'deep')).toBe(deep);
		});
	});

	describe('findParentById', () => {
		it('returns null for root id', () => {
			const root = node('root');
			expect(findParentById(root, 'root')).toBeNull();
		});

		it('returns null when id not in tree', () => {
			const root = node('root', [node('a')]);
			expect(findParentById(root, 'x')).toBeNull();
		});

		it('returns root as parent of direct child', () => {
			const root = node('root', [node('child')]);
			expect(findParentById(root, 'child')).toBe(root);
		});

		it('returns correct parent for nested node', () => {
			const mid = node('mid', [node('deep')]);
			const root = node('root', [mid]);
			expect(findParentById(root, 'deep')).toBe(mid);
			expect(findParentById(root, 'mid')).toBe(root);
		});
	});
});
