import type { ObjectType } from './types.js';

/** Object types that can have tree children. Only these may be used as parent_id. */
export const CONTAINER_OBJECT_TYPES: readonly ObjectType[] = [
	'project',
	'folder',
	'grid-layout',
	'flex-layout',
	'tabs',
	'stack'
] as const;

export function canContainChildren(type: ObjectType): boolean {
	return (CONTAINER_OBJECT_TYPES as readonly string[]).includes(type);
}
