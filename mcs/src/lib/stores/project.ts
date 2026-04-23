import { writable } from 'svelte/store';
import type { ProjectDateTimeSettings } from './settings.js';
import type { MCSObject } from '$lib/objects/types.js';
import type { TutorialExampleKind } from '$lib/tutorial-kinds.js';

export interface CurrentProjectSettings {
	dateTime?: ProjectDateTimeSettings;
	autoStartPlugins?: string[];
	tutorialExampleKind?: TutorialExampleKind;
}

export interface CurrentProject {
	id: string;
	name: string;
	path: string;
	settings?: CurrentProjectSettings;
}

export const currentProject = writable<CurrentProject | null>(null);
export const selectedObjectId = writable<string | null>(null);

/** Cached selected object; populated when selectedObjectId is set. Center header and Properties read from this. */
export const selectedObject = writable<MCSObject | null>(null);

/**
 * When viewing a layout, you can inspect a child object in the Properties panel
 * without changing the center view (and without changing the URL).
 */
export type InspectedLayoutObject = {
	layoutObjectId: string;
	objectId: string;
} | null;
export const inspectedLayoutObject = writable<InspectedLayoutObject>(null);

/** True while the selected object is being fetched. */
export const selectedObjectLoading = writable(false);

/** Error message if the last fetch for the selected object failed. */
export const selectedObjectError = writable<string | null>(null);

/** When editing placement of a layout item (e.g. grid cell), selectedObjectId stays the parent layout; this identifies the item. */
export type SelectedLayoutContext = {
	layoutObjectId: string;
	layoutType: 'grid';
	itemId: string;
} | null;
export const selectedLayoutContext = writable<SelectedLayoutContext>(null);

/** Bump to force refetch of the selected object (e.g. after PATCH). */
export const selectedObjectVersion = writable(0);

/** When viewing a grid layout: true = show resize/drag handles and allow drop; false = view-only, cleaner. */
export const gridLayoutEditMode = writable(false);

export function invalidateSelectedObject(): void {
	selectedObjectVersion.update((n) => n + 1);
}
