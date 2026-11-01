import { writable, get } from 'svelte/store';

/**
 * Replay is deliberately driven by one clock. Displays only observe this
 * store; they must not create their own playback timers. These limits also
 * keep a suspended tab or malformed caller from jumping an unbounded amount
 * of time in one update.
 */
export const MAX_REPLAY_SPEED = 100;
export const MAX_REPLAY_DELTA_SECONDS = 10;
export const MAX_REPLAY_FRAME_RATE = 240;

export type DataSessionMode = 'live' | 'replay' | 'render';

export interface ReplayClockState {
	mode: DataSessionMode;
	projectId: string | null;
	runId: string | null;
	start: number;
	end: number;
	playhead: number;
	playing: boolean;
	speed: number;
	loop: boolean;
	loopStart: number | null;
	loopEnd: number | null;
	frameRate: number;
}

/** An item that can be ordered on the replay timeline. */
export interface ReplayTimestamped {
	timestamp: number;
	/** Stable source order for equal timestamps (for example a DB event ordinal). */
	sequence?: number;
}

const initialState: ReplayClockState = {
	mode: 'live',
	projectId: null,
	runId: null,
	start: 0,
	end: 0,
	playhead: 0,
	playing: false,
	speed: 1,
	loop: false,
	loopStart: null,
	loopEnd: null,
	frameRate: 60
};

export const replayClock = writable<ReplayClockState>(initialState);

let playbackTimer: ReturnType<typeof setInterval> | null = null;
let lastPlaybackTick = 0;

function clearPlaybackTimer(): void {
	if (playbackTimer !== null) {
		clearInterval(playbackTimer);
		playbackTimer = null;
	}
}

function clamp(value: number, start: number, end: number): number {
	if (!Number.isFinite(value)) return start;
	return Math.max(start, Math.min(end, value));
}

export function configureReplaySession(options: {
	projectId?: string | null;
	runId?: string | null;
	start: number;
	end: number;
	playhead?: number;
	frameRate?: number;
}): void {
	const start = Number.isFinite(options.start) ? options.start : 0;
	const end = Math.max(start + 0.001, Number.isFinite(options.end) ? options.end : start + 1);
	clearPlaybackTimer();
	replayClock.set({
		...initialState,
		mode: 'replay',
		projectId: options.projectId ?? null,
		runId: options.runId ?? null,
		start,
		end,
		playhead: clamp(options.playhead ?? start, start, end),
		frameRate: Math.max(1, Math.min(MAX_REPLAY_FRAME_RATE, Math.floor(options.frameRate ?? 60)))
	});
}

export function configureRenderSession(options: {
	projectId: string;
	runId: string;
	start: number;
	end: number;
	frameRate?: number;
}): void {
	configureReplaySession(options);
	replayClock.update((state) => ({ ...state, mode: 'render' }));
}

export function exitReplaySession(): void {
	clearPlaybackTimer();
	replayClock.set(initialState);
}

export function seekReplay(playhead: number): void {
	replayClock.update((state) => {
		if (state.mode === 'live') return state;
		return { ...state, playhead: clamp(playhead, state.start, state.end) };
	});
}

/** Update the active session bounds while preserving the current playhead. */
export function setReplayBounds(startValue: number, endValue: number): void {
	replayClock.update((state) => {
		if (state.mode === 'live') return state;
		const start = Number.isFinite(startValue) ? startValue : state.start;
		const end = Math.max(start + 0.001, Number.isFinite(endValue) ? endValue : state.end);
		return { ...state, start, end, playhead: clamp(state.playhead, start, end) };
	});
}

export function setReplayPlaying(playing: boolean): void {
	if (!playing) clearPlaybackTimer();
	replayClock.update((state) => ({ ...state, playing: state.mode !== 'live' && playing }));
}

export function setReplaySpeed(speed: number): void {
	if (!Number.isFinite(speed) || speed <= 0) return;
	replayClock.update((state) => ({
		...state,
		speed: Math.max(0.05, Math.min(MAX_REPLAY_SPEED, speed))
	}));
}

export function setReplayLoop(loop: boolean, start?: number | null, end?: number | null): void {
	replayClock.update((state) => {
		const loopStart = start == null ? state.start : clamp(start, state.start, state.end);
		const loopEnd = end == null ? state.end : clamp(end, loopStart, state.end);
		return { ...state, loop, loopStart, loopEnd };
	});
}

/** Advance the one shared clock. Rendering uses this with exact frame deltas. */
export function advanceReplay(deltaSeconds: number): ReplayClockState {
	let next = get(replayClock);
	if (
		!next.playing ||
		next.mode === 'live' ||
		!Number.isFinite(deltaSeconds) ||
		deltaSeconds <= 0
	) {
		return next;
	}
	const boundedDelta = Math.min(deltaSeconds, MAX_REPLAY_DELTA_SECONDS);
	const end = next.loop && next.loopEnd !== null ? next.loopEnd : next.end;
	const start = next.loop && next.loopStart !== null ? next.loopStart : next.start;
	let playhead = next.playhead + boundedDelta * next.speed;
	if (playhead >= end) {
		if (next.loop) playhead = start + ((playhead - start) % Math.max(0.001, end - start));
		else {
			playhead = end;
			next = { ...next, playing: false };
		}
	}
	next = { ...next, playhead };
	replayClock.set(next);
	return next;
}

/** Start the single interactive playback driver owned by the replay clock. */
export function startReplayClock(): void {
	const state = get(replayClock);
	if (state.mode === 'live') return;
	clearPlaybackTimer();
	setReplayPlaying(true);
	lastPlaybackTick = performance.now();
	playbackTimer = setInterval(() => {
		const now = performance.now();
		const elapsed = Math.max(0, (now - lastPlaybackTick) / 1000);
		lastPlaybackTick = now;
		advanceReplay(elapsed);
		if (!get(replayClock).playing) clearPlaybackTimer();
	}, 50);
}

/** Stop interactive playback and release the only replay timer. */
export function stopReplayClock(): void {
	clearPlaybackTimer();
	setReplayPlaying(false);
}

export function stepReplayFrame(direction: 1 | -1 = 1): void {
	const state = get(replayClock);
	if (state.mode === 'live') return;
	seekReplay(state.playhead + direction / Math.max(1, state.frameRate));
}

export function isReplaySession(state: ReplayClockState): boolean {
	return state.mode === 'replay' || state.mode === 'render';
}

/**
 * Return a deterministic copy sorted by timestamp, then source sequence, then
 * original position. The final tie-break makes equal timestamps deterministic
 * even when a supplier omitted an explicit sequence.
 */
export function orderReplaySamples<T extends ReplayTimestamped>(samples: readonly T[]): T[] {
	return samples
		.map((sample, index) => ({ sample, index }))
		.sort((a, b) => {
			const at = Number.isFinite(a.sample.timestamp)
				? a.sample.timestamp
				: Number.POSITIVE_INFINITY;
			const bt = Number.isFinite(b.sample.timestamp)
				? b.sample.timestamp
				: Number.POSITIVE_INFINITY;
			const as = a.sample.sequence ?? Number.MAX_SAFE_INTEGER;
			const bs = b.sample.sequence ?? Number.MAX_SAFE_INTEGER;
			return at - bt || as - bs || a.index - b.index;
		})
		.map(({ sample }) => sample);
}

/** Find the exclusive upper bound for samples at or before a replay time. */
export function replayUpperBound<T extends ReplayTimestamped>(
	samples: readonly T[],
	time: number
): number {
	if (!Number.isFinite(time)) return 0;
	let low = 0;
	let high = samples.length;
	while (low < high) {
		const middle = low + Math.floor((high - low) / 2);
		if (samples[middle].timestamp <= time) low = middle + 1;
		else high = middle;
	}
	return low;
}
