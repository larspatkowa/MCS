import { describe, it, expect } from 'vitest';
import { rowToObject } from '../types';
import type { ObjectRow } from '../types';

describe('types', () => {
	describe('rowToObject', () => {
		it('maps row fields to camelCase object', () => {
			const row: ObjectRow = {
				id: 'id-1',
				type: 'folder',
				parent_id: 'parent-1',
				sort_order: 0,
				name: 'Folder',
				notes: 'notes',
				props: '{}',
				created_at: '2024-01-01T00:00:00.000Z',
				updated_at: '2024-01-02T00:00:00.000Z'
			};
			const obj = rowToObject(row);
			expect(obj.id).toBe('id-1');
			expect(obj.type).toBe('folder');
			expect(obj.name).toBe('Folder');
			expect(obj.notes).toBe('notes');
			expect(obj.createdAt).toBe(row.created_at);
			expect(obj.updatedAt).toBe(row.updated_at);
			expect(obj.props).toEqual({});
		});

		it('parses props JSON', () => {
			const row: ObjectRow = {
				id: 'x',
				type: 'gauge',
				parent_id: null,
				sort_order: 0,
				name: 'G',
				notes: '',
				props: '{"min":0,"max":100}',
				created_at: '',
				updated_at: ''
			};
			const obj = rowToObject(row);
			expect(obj.props).toEqual({ min: 0, max: 100 });
		});

		it('uses empty object for invalid props', () => {
			const row: ObjectRow = {
				id: 'x',
				type: 'folder',
				parent_id: null,
				sort_order: 0,
				name: 'F',
				notes: '',
				props: 'not json',
				created_at: '',
				updated_at: ''
			};
			const obj = rowToObject(row);
			expect(obj.props).toEqual({});
		});

		it('defaults notes to empty string when null', () => {
			const row: ObjectRow = {
				id: 'x',
				type: 'folder',
				parent_id: null,
				sort_order: 0,
				name: 'F',
				notes: null as unknown as string,
				props: '{}',
				created_at: '',
				updated_at: ''
			};
			const obj = rowToObject(row);
			expect(obj.notes).toBe('');
		});
	});
});
