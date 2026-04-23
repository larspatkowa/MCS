import { writable } from 'svelte/store';

const LEFT_KEY = 'mcs-sidebar-left';
const RIGHT_KEY = 'mcs-sidebar-right';
const LEFT_WIDTH_KEY = 'mcs-sidebar-left-width';
const RIGHT_WIDTH_KEY = 'mcs-sidebar-right-width';

const LEFT_WIDTH_MIN = 200;
const LEFT_WIDTH_MAX = 400;
const RIGHT_WIDTH_MIN = 200;
const RIGHT_WIDTH_MAX = 400;

/** Default widths (double-click resizer to reset). */
export const LEFT_WIDTH_DEFAULT = 280;
export const RIGHT_WIDTH_DEFAULT = 280;

function stored(key: string, fallback: boolean): boolean {
	if (typeof window === 'undefined') return fallback;
	try {
		const v = localStorage.getItem(key);
		if (v === null) return fallback;
		return v === 'true';
	} catch {
		return fallback;
	}
}

function storedNumber(key: string, fallback: number, min: number, max: number): number {
	if (typeof window === 'undefined') return fallback;
	try {
		const v = localStorage.getItem(key);
		if (v === null) return fallback;
		const n = Number(v);
		if (!Number.isFinite(n)) return fallback;
		return Math.max(min, Math.min(max, Math.round(n)));
	} catch {
		return fallback;
	}
}

function persist(key: string, value: boolean): void {
	try {
		localStorage.setItem(key, String(value));
	} catch {}
}

function persistNumber(key: string, value: number): void {
	try {
		localStorage.setItem(key, String(value));
	} catch {}
}

export const sidebarLeftVisible = writable<boolean>(stored(LEFT_KEY, true));
export const sidebarRightVisible = writable<boolean>(stored(RIGHT_KEY, true));

/** Pixel width of the left sidebar (resizable; persisted). */
export const sidebarLeftWidthPx = writable<number>(
	storedNumber(LEFT_WIDTH_KEY, LEFT_WIDTH_DEFAULT, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX)
);
/** Pixel width of the right sidebar (resizable; persisted). */
export const sidebarRightWidthPx = writable<number>(
	storedNumber(RIGHT_WIDTH_KEY, RIGHT_WIDTH_DEFAULT, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX)
);

export { LEFT_WIDTH_MIN, LEFT_WIDTH_MAX, RIGHT_WIDTH_MIN, RIGHT_WIDTH_MAX };

sidebarLeftVisible.subscribe((v) => persist(LEFT_KEY, v));
sidebarRightVisible.subscribe((v) => persist(RIGHT_KEY, v));
sidebarLeftWidthPx.subscribe((v) => persistNumber(LEFT_WIDTH_KEY, v));
sidebarRightWidthPx.subscribe((v) => persistNumber(RIGHT_WIDTH_KEY, v));
