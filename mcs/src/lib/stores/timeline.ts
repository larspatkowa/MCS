import { get, writable } from 'svelte/store';
import {
	configureReplaySession,
	exitReplaySession,
	replayClock,
	setReplayBounds,
	seekReplay
} from './replay-session.js';

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

if (typeof window !== 'undefined' && get(timeConductorState).mode === 'fixed') {
	const initial = get(timeConductorState);
	configureReplaySession({
		start: initial.fixedStart,
		end: initial.fixedEnd,
		playhead: initial.fixedEnd
	});
}

// Keep legacy timeline consumers visually synchronized while replay-capable
// components move to the shared replay clock.
replayClock.subscribe((clock) => {
	timeConductorState.update((state) => {
		if (clock.mode === 'live') return { ...state, mode: 'realtime' };
		return {
			...state,
			mode: 'fixed',
			fixedStart: clock.start,
			fixedEnd: clock.end
		};
	});
});

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
	const clock = get(replayClock);
	if (clock.mode !== 'live') return { start: clock.start, end: clock.end };
	if (state.mode === 'realtime') {
		return {
			start: nowSec - state.realtimeWindowSec,
			end: nowSec
		};
	}
	return { start: state.fixedStart, end: state.fixedEnd };
}

export function setFixedBounds(start: number, end: number): void {
	if (!Number.isFinite(start) || !Number.isFinite(end)) return;
	const fixedStart = Math.min(start, end);
	const fixedEnd = Math.max(fixedStart + 0.001, end);
	timeConductorState.update((s) => ({ ...s, mode: 'fixed', fixedStart, fixedEnd }));
	const clock = get(replayClock);
	if (clock.mode === 'live' || clock.runId === null) {
		configureReplaySession({ start: fixedStart, end: fixedEnd, playhead: fixedEnd });
	} else {
		setReplayBounds(fixedStart, fixedEnd);
	}
}

export function setRealtimeWithPreset(rangeId: TimelineRangeId): void {
	exitReplaySession();
	timelineRange.set(rangeId);
	timeConductorState.update((s) => ({
		...s,
		mode: 'realtime',
		realtimeWindowSec: getWindowSeconds(rangeId)
	}));
}

export function shiftFixedWindow(deltaSec: number): void {
	if (!Number.isFinite(deltaSec)) return;
	const current = get(timeConductorState);
	const clock = get(replayClock);
	setFixedBounds(current.fixedStart + deltaSec, current.fixedEnd + deltaSec);
	if (clock.mode !== 'live') seekReplay(clock.playhead + deltaSec);
}
