import type { Component } from 'svelte';

export interface ObjectTypeInfo {
	label: string;
	icon?: Component;
	defaultProps?: Record<string, unknown>;
	creatable?: boolean;
	/** Optional group for "Add object" modal (e.g. "Containers", "Charts"). */
	group?: string;
}

const types = new Map<string, ObjectTypeInfo>();

export function registerType(typeId: string, info: ObjectTypeInfo): void {
	types.set(typeId, { creatable: true, ...info });
}

export function getType(typeId: string): ObjectTypeInfo | undefined {
	return types.get(typeId);
}

export function getTypeLabel(typeId: string): string {
	return types.get(typeId)?.label ?? typeId;
}

export function getCreatableTypes(): { typeId: string; info: ObjectTypeInfo }[] {
	return Array.from(types.entries())
		.filter(([, info]) => info.creatable !== false)
		.map(([typeId, info]) => ({ typeId, info }));
}

export function hasType(typeId: string): boolean {
	return types.has(typeId);
}
