import { writable } from 'svelte/store';

export interface RenderContextState {
	active: boolean;
	transparent: boolean;
	background: string;
	showChrome: boolean;
}

const initial: RenderContextState = {
	active: false,
	transparent: false,
	background: '#202020',
	showChrome: true
};

export const renderContext = writable<RenderContextState>(initial);

export function configureRenderContext(
	options: Partial<Omit<RenderContextState, 'active'>> = {}
): void {
	renderContext.set({ ...initial, ...options, active: true });
}

export function clearRenderContext(): void {
	renderContext.set(initial);
}
