import { writable } from 'svelte/store';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'mcs-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredTheme(): ThemeName | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === 'dark' || stored === 'light' ? stored : null;
	} catch {
		return null;
	}
}

function systemTheme(): ThemeName {
	return window.matchMedia?.(DARK_QUERY).matches === false ? 'light' : 'dark';
}

function applyTheme(value: ThemeName): void {
	document.documentElement.classList.remove('theme-light', 'theme-dark');
	document.documentElement.classList.add(`theme-${value}`);
}

// Without an explicit choice the theme follows the operating system. A choice
// made with the toggle is stored and takes precedence from then on.
const browser = typeof window !== 'undefined';
let explicit = browser && readStoredTheme() !== null;
const store = writable<ThemeName>(browser ? (readStoredTheme() ?? systemTheme()) : 'dark');

if (browser) {
	store.subscribe(applyTheme);
	window.matchMedia?.(DARK_QUERY).addEventListener?.('change', () => {
		if (!explicit) store.set(systemTheme());
	});
}

export const theme = {
	subscribe: store.subscribe,
	set(value: ThemeName): void {
		explicit = true;
		try {
			localStorage.setItem(STORAGE_KEY, value);
		} catch {
			// The choice still applies for this page load.
		}
		store.set(value);
	}
};
