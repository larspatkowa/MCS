import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	advanceReplay,
	configureReplaySession,
	exitReplaySession,
	MAX_REPLAY_DELTA_SECONDS,
	orderReplaySamples,
	replayClock,
	replayUpperBound,
	setReplayBounds,
	seekReplay,
	setReplayLoop,
	setReplayPlaying
} from './replay-session.js';

afterEach(() => exitReplaySession());

describe('replay clock', () => {
	it('orders equal timestamps by source sequence, then original position', () => {
		const ordered = orderReplaySamples([
			{ timestamp: 2, sequence: 4, id: 'late' },
			{ timestamp: 1, sequence: 3, id: 'first' },
			{ timestamp: 1, sequence: 1, id: 'earlier' },
			{ timestamp: 1, id: 'unspecified' }
		]);
		expect(ordered.map((item) => item.id)).toEqual(['earlier', 'first', 'unspecified', 'late']);
	});

	it('uses an upper bound that includes every sample at the playhead', () => {
		const samples = orderReplaySamples([
			{ timestamp: 1, sequence: 2 },
			{ timestamp: 1, sequence: 1 },
			{ timestamp: 3, sequence: 3 }
		]);
		expect(replayUpperBound(samples, 1)).toBe(2);
		expect(samples.slice(0, replayUpperBound(samples, 1))).toHaveLength(2);
	});

	it('clamps scrubbing to finite session bounds', () => {
		configureReplaySession({ projectId: 'project', runId: 'run', start: 10, end: 20 });
		seekReplay(Number.NaN);
		expect(get(replayClock).playhead).toBe(10);
		seekReplay(1_000);
		expect(get(replayClock).playhead).toBe(20);
		seekReplay(-1_000);
		expect(get(replayClock).playhead).toBe(10);
	});

	it('keeps the playhead inside updated bounds', () => {
		configureReplaySession({ projectId: 'project', runId: 'run', start: 0, end: 20, playhead: 15 });
		setReplayBounds(10, 12);
		expect(get(replayClock)).toMatchObject({ start: 10, end: 12, playhead: 12 });
	});

	it('bounds a delayed tick and stops at the end', () => {
		configureReplaySession({ projectId: 'project', runId: 'run', start: 0, end: 20 });
		setReplayPlaying(true);
		advanceReplay(MAX_REPLAY_DELTA_SECONDS + 100);
		expect(get(replayClock).playhead).toBe(MAX_REPLAY_DELTA_SECONDS);
		advanceReplay(100);
		expect(get(replayClock).playhead).toBe(20);
		expect(get(replayClock).playing).toBe(false);
	});

	it('wraps deterministically inside an explicit loop range', () => {
		configureReplaySession({ projectId: 'project', runId: 'run', start: 0, end: 20 });
		setReplayLoop(true, 5, 10);
		seekReplay(9);
		setReplayPlaying(true);
		advanceReplay(2);
		expect(get(replayClock).playhead).toBe(6);
	});
});
