import { describe, it, expect } from 'vitest';
import { canContainChildren, CONTAINER_OBJECT_TYPES } from '../containment';
import type { ObjectType } from '../types';

describe('containment', () => {
	it('returns true for all container types', () => {
		for (const type of CONTAINER_OBJECT_TYPES) {
			expect(canContainChildren(type)).toBe(true);
		}
	});

	it('returns false for non-container types', () => {
		const nonContainers: ObjectType[] = [
			'gauge',
			'line-plot',
			'telemetry-table',
			'markdown-note',
			'image',
			'video-stream'
		];
		for (const type of nonContainers) {
			expect(canContainChildren(type)).toBe(false);
		}
	});

	it('includes project, folder, and supported layouts', () => {
		expect(CONTAINER_OBJECT_TYPES).toContain('project');
		expect(CONTAINER_OBJECT_TYPES).toContain('folder');
		expect(CONTAINER_OBJECT_TYPES).toContain('grid-layout');
		expect(CONTAINER_OBJECT_TYPES).toContain('flex-layout');
	});
});
