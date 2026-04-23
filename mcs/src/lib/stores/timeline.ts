import { writable } from 'svelte/store';

export type TimelineRangeId = '1h' | '24h';

export type TimeConductorMode = 'realtime' | 'fixed';

export interface TimeConductorState {
	mode: TimeConductorMode;
	/** Realtime rolling window in seconds (used when mode === 'realtime'). */
	realtimeWindowSec: number;
	/** Fixed bounds in unix seconds (used when mode === 'fixed'). */
	fixedStart: number;
	fixedEnd: number;
}

const STORAGE_KEY_RANGE = 'mcs-timeline-range';
const STORAGE_KEY_MODE = 'mcs-time-conductor-mode';
const STORAGE_KEY_FIXED = 'mcs-time-conductor-fixed';

function storedRange(): TimelineRangeId {
	if (typeof window === 'undefined') return '1h';
	const v = localStorage.getItem(STORAGE_KEY_RANGE);
	if (v === '1h' || v === '24h') return v;
	return '1h';
}

function storedMode(): TimeConductorMode {
	if (typeof window === 'undefined') return 'realtime';
	const v = localStorage.getItem(STORAGE_KEY_MODE);
	if (v === 'fixed' || v === 'realtime') return v;
	return 'realtime';
}

function storedFixed(): { start: number; end: number } {
	if (typeof window === 'undefined') {
		const now = Date.now() / 1000;
		return { start: now - 3600, end: now };
	}
	try {
		const v = localStorage.getItem(STORAGE_KEY_FIXED);
		if (v) {
			const { start, end } = JSON.parse(v) as { start: number; end: number };
			if (typeof start === 'number' && typeof end === 'number') return { start, end };
		}
	} catch {}
	const now = Date.now() / 1000;
	return { start: now - 3600, end: now };
}

export function getWindowSeconds(range: TimelineRangeId): number {
	return range === '24h' ? 86400 : 3600;
}

/** Legacy: preset id for realtime window. Still used by UI to set realtimeWindowSec. */
export const timelineRange = writable<TimelineRangeId>(storedRange());

timelineRange.subscribe((v) => {
	try {
		localStorage.setItem(STORAGE_KEY_RANGE, v);
	} catch {}
});

function defaultState(): TimeConductorState {
	const range = storedRange();
	const fixed = storedFixed();
	return {
		mode: storedMode(),
		realtimeWindowSec: getWindowSeconds(range),
		fixedStart: fixed.start,
		fixedEnd: fixed.end
	};
}

export const timeConductorState = writable<TimeConductorState>(defaultState());

timeConductorState.subscribe((s) => {
	try {
		localStorage.setItem(STORAGE_KEY_MODE, s.mode);
		localStorage.setItem(
			STORAGE_KEY_FIXED,
			JSON.stringify({ start: s.fixedStart, end: s.fixedEnd })
		);
	} catch {}
});

/** Sync realtime window when timelineRange (preset) changes. */
timelineRange.subscribe((rangeId) => {
	timeConductorState.update((s) => ({
		...s,
		realtimeWindowSec: getWindowSeconds(rangeId)
	}));
});

/**
 * Get current time bounds in unix seconds.
 * In realtime mode: rolling window ending now.
 * In fixed mode: stored fixedStart/fixedEnd.
 */
export function getTimeBounds(
	state: TimeConductorState,
	nowSec: number = Date.now() / 1000
): { start: number; end: number } {
	if (state.mode === 'realtime') {
		return {
			start: nowSec - state.realtimeWindowSec,
			end: nowSec
		};
	}
	return { start: state.fixedStart, end: state.fixedEnd };
}

export function setFixedBounds(start: number, end: number): void {
	timeConductorState.update((s) => ({
		...s,
		mode: 'fixed',
		fixedStart: start,
		fixedEnd: end
	}));
}

export function setRealtimeWithPreset(rangeId: TimelineRangeId): void {
	timelineRange.set(rangeId);
	timeConductorState.update((s) => ({
		...s,
		mode: 'realtime',
		realtimeWindowSec: getWindowSeconds(rangeId)
	}));
}

export function shiftFixedWindow(deltaSec: number): void {
	timeConductorState.update((s) => ({
		...s,
		mode: 'fixed',
		fixedStart: s.fixedStart + deltaSec,
		fixedEnd: s.fixedEnd + deltaSec
	}));
}
