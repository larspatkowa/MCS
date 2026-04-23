import type { Component } from 'svelte';

export type LazyViewLoader = () => Promise<{ default: Component<any> }>;

/**
 * View registry entries can be either:
 *  - A direct Component reference (synchronous, legacy)
 *  - A lazy loader function that returns a dynamic import promise
 */
type ViewEntry = Component<any> | LazyViewLoader;

const viewRegistry = new Map<string, ViewEntry>();
const resolvedCache = new Map<string, Component<any>>();

/**
 * Register a view — accepts either a Component or a lazy loader.
 * Prefer lazy loaders for code-splitting: `registerView('type', () => import('./MyView.svelte'))`
 */
export function registerView(typeId: string, component: ViewEntry): void {
	viewRegistry.set(typeId, component);
}

/**
 * Synchronously get a cached/direct view component.
 * Returns undefined if the view hasn't been resolved yet (use resolveView for lazy).
 */
export function getView(typeId: string): Component<any> | undefined {
	// Check resolved cache first
	const cached = resolvedCache.get(typeId);
	if (cached) return cached;

	const entry = viewRegistry.get(typeId);
	if (!entry) return undefined;

	// If it's a direct component (not a function returning a promise), return it
	if (typeof entry !== 'function' || !isLazyLoader(entry)) {
		return entry as Component<any>;
	}

	return undefined;
}

/**
 * Resolve a view component, loading it lazily if needed.
 * Returns the component or undefined if not registered.
 */
export async function resolveView(typeId: string): Promise<Component<any> | undefined> {
	// Check resolved cache first
	const cached = resolvedCache.get(typeId);
	if (cached) return cached;

	const entry = viewRegistry.get(typeId);
	if (!entry) return undefined;

	// If it's a direct component, cache and return
	if (typeof entry !== 'function' || !isLazyLoader(entry)) {
		const comp = entry as Component<any>;
		resolvedCache.set(typeId, comp);
		return comp;
	}

	// Lazy loader — resolve, cache, and return
	try {
		const mod = await (entry as LazyViewLoader)();
		const comp = mod.default;
		resolvedCache.set(typeId, comp);
		return comp;
	} catch (err) {
		console.error('[views] Dynamic import failed for typeId:', typeId, err);
		return undefined;
	}
}

export function hasView(typeId: string): boolean {
	return viewRegistry.has(typeId);
}

/**
 * Heuristic: a lazy loader is a function whose name is empty or starts with
 * arrow-function-like patterns. Svelte components are also functions but they
 * have specific properties. We check if calling it returns a thenable.
 */
function isLazyLoader(fn: Function): boolean {
	// Svelte 5 components are functions with $$render / component metadata.
	// Lazy loaders are plain arrow functions `() => import(...)`.
	// We can't reliably distinguish by introspection alone, so we mark lazy
	// loaders in the registry phase.
	return (fn as any).__lazy === true;
}

/** Utility: wrap a dynamic import so the registry can distinguish it from a component function */
export function lazy(loader: LazyViewLoader): LazyViewLoader {
	const fn = loader as any;
	fn.__lazy = true;
	return fn;
}
