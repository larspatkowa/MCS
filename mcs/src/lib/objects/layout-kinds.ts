import type { ObjectType } from './types.js';

export const LAYOUT_OBJECT_TYPES = ['layout', 'flex-layout', 'grid-layout', 'stack'] as const;

export type LayoutObjectType = (typeof LAYOUT_OBJECT_TYPES)[number];

export function isLayoutObjectType(type: string | null | undefined): type is LayoutObjectType {
	return type != null && (LAYOUT_OBJECT_TYPES as readonly string[]).includes(type);
}

export function isGridLayoutType(
	type: ObjectType | string | null | undefined
): type is 'grid-layout' {
	return type === 'grid-layout';
}
