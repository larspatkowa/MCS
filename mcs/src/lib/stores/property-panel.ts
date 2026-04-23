import { writable } from 'svelte/store';

/** Global property-row filter text for the currently visible properties panel. */
export const propertyFilterText = writable('');

export type PropertyPanelMode = 'essentials' | 'advanced';

const MODE_KEY = 'mcs-properties-mode';

function getStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	const storage = window.localStorage as Storage | undefined;
	if (!storage) return null;
	if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null;
	return storage;
}

function readStoredMode(): PropertyPanelMode {
	const storage = getStorage();
	if (!storage) return 'essentials';
	const raw = storage.getItem(MODE_KEY);
	return raw === 'advanced' ? 'advanced' : 'essentials';
}

/** Controls whether the properties panel shows only core controls or all controls. */
export const propertyPanelMode = writable<PropertyPanelMode>(readStoredMode());

const storage = getStorage();
if (storage) {
	propertyPanelMode.subscribe((mode) => {
		storage.setItem(MODE_KEY, mode);
	});
}
