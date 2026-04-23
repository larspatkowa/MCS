import type { Component } from 'svelte';

const propertyEditorRegistry = new Map<string, Component<any>>();

export function registerPropertyEditor(typeId: string, component: Component<any>): void {
	propertyEditorRegistry.set(typeId, component);
}

export function getPropertyEditor(typeId: string): Component<any> | undefined {
	return propertyEditorRegistry.get(typeId);
}

export function hasPropertyEditor(typeId: string): boolean {
	return propertyEditorRegistry.has(typeId);
}
