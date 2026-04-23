import { writable } from 'svelte/store';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'mcs-theme';

function loadTheme(): ThemeName {
	if (typeof window === 'undefined') return 'dark';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'dark' || stored === 'light') return stored;
	return 'dark';
}

export const theme = writable<ThemeName>(loadTheme());

theme.subscribe((value) => {
	if (typeof document !== 'undefined') {
		document.documentElement.classList.remove('theme-light', 'theme-dark');
		document.documentElement.classList.add(`theme-${value}`);
		localStorage.setItem(STORAGE_KEY, value);
	}
});
