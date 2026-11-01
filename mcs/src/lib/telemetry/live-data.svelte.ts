/**
 * Shared data access for views that show the newest value of a stream or a
 * stream's recent track. Both follow the same three sources as the built-in
 * plots: live SSE with polling fallback, the time conductor's fixed window,
 * and run replay at the replay playhead.
 */
import { fromStore } from 'svelte/store';
import { subscribeSSE } from '$lib/sse-manager.js';
import { currentProject } from '$lib/stores/project.js';
import { timeConductorState } from '$lib/stores/timeline.js';
import { replayClock } from '$lib/stores/replay-session.js';
import { replayRunId, replaySamplesForStream } from '$lib/stores/run.js';

export interface TimedValues {
	timestamp: number;
	/** Wall-clock receive time in Unix seconds, when the server reported it. */
	receivedAt?: number;
	values: Record<string, unknown>;
}

export type DataMode = 'live' | 'history' | 'replay';

const META_KEYS = new Set(['timestamp', 'eventId', 'receivedAt', 'kind', 'sequence']);

function payloadOf(sample: Record<string, unknown>): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(sample)) {
		if (!META_KEYS.has(key)) values[key] = value;
	}
	return values;
}

async function fetchSamples(
	projectId: string,
	streamId: string,
	query: Record<string, string | number>,
	signal: AbortSignal
): Promise<Record<string, unknown>[]> {
	const params = new URLSearchParams(
		Object.entries(query).map(([key, value]) => [key, String(value)])
	);
	const response = await fetch(
		`/api/projects/${encodeURIComponent(projectId)}/streams/${encodeURIComponent(streamId)}/samples?${params}`,
		{ signal }
	);
	if (!response.ok) throw new Error(`Stream request failed (${response.status})`);
	const body = (await response.json()) as { data?: Record<string, unknown>[] };
	return Array.isArray(body.data) ? body.data : [];
}

function toTimed(sample: Record<string, unknown>): TimedValues {
	return {
		timestamp: Number(sample.timestamp),
		receivedAt: typeof sample.receivedAt === 'number' ? sample.receivedAt : undefined,
		values: payloadOf(sample)
	};
}

/** Reactive data-mode flags shared by the helpers below. */
function modeState() {
	const conductor = fromStore(timeConductorState);
	const clock = fromStore(replayClock);
	const runId = fromStore(replayRunId);
	return {
		get mode(): DataMode {
			if (runId.current && clock.current.mode !== 'live') return 'replay';
			if (conductor.current.mode === 'fixed' || clock.current.mode !== 'live') return 'history';
			return 'live';
		},
		get playhead(): number {
			return clock.current.mode === 'live' ? conductor.current.fixedEnd : clock.current.playhead;
		},
		get windowStart(): number {
			return conductor.current.fixedStart;
		}
	};
}

const LIVE_POLL_MS = 5_000;
const HISTORY_DEBOUNCE_MS = 200;

/**
 * Newest sample per stream. In history and replay modes "newest" means the
 * last sample at or before the playhead.
 */
export function useLatestValues(streams: () => string[]) {
	const project = fromStore(currentProject);
	const modes = modeState();
	let latest = $state<Record<string, TimedValues>>({});
	let error = $state('');

	function accept(streamId: string, next: TimedValues): void {
		if (!Number.isFinite(next.timestamp)) return;
		const previous = latest[streamId];
		if (previous && previous.timestamp > next.timestamp) return;
		latest[streamId] = next;
	}

	// Replay reads the in-memory run package at the playhead.
	$effect(() => {
		if (modes.mode !== 'replay') return;
		const playhead = modes.playhead;
		const next: Record<string, TimedValues> = {};
		for (const streamId of streams()) {
			const sample = replaySamplesForStream(streamId, { to: playhead })?.at(-1);
			if (sample) next[streamId] = toTimed(sample);
		}
		latest = next;
	});

	// History asks the server for the last sample at or before the playhead.
	$effect(() => {
		if (modes.mode !== 'history') return;
		const projectId = project.current?.id;
		const ids = streams();
		const to = modes.playhead;
		if (!projectId) return;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const entries = await Promise.all(
					ids.map(async (id) => {
						const [sample] = await fetchSamples(
							projectId,
							id,
							{ to, limit: 1, includeReceivedAt: 1 },
							controller.signal
						);
						return [id, sample ? toTimed(sample) : undefined] as const;
					})
				);
				latest = Object.fromEntries(entries.filter(([, value]) => value)) as Record<
					string,
					TimedValues
				>;
				error = '';
			} catch (cause) {
				if (!controller.signal.aborted) error = (cause as Error).message;
			}
		}, HISTORY_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Live seeds from the newest stored sample, then follows SSE. A slow poll
	// covers a dropped event stream.
	$effect(() => {
		if (modes.mode !== 'live') return;
		const projectId = project.current?.id;
		const ids = streams();
		if (!projectId || ids.length === 0) return;
		latest = {};
		const controller = new AbortController();
		const wanted = new Set(ids);
		const seed = async () => {
			try {
				await Promise.all(
					ids.map(async (id) => {
						const [sample] = await fetchSamples(
							projectId,
							id,
							{ limit: 1, includeReceivedAt: 1 },
							controller.signal
						);
						if (sample) accept(id, toTimed(sample));
					})
				);
				error = '';
			} catch (cause) {
				if (!controller.signal.aborted) error = (cause as Error).message;
			}
		};
		void seed();
		const timer = setInterval(() => void seed(), LIVE_POLL_MS);
		const unsubscribe = subscribeSSE(projectId, '*', (event) => {
			if (!('values' in event) || !wanted.has(event.streamId)) return;
			const last = event.samples?.at(-1) ?? event;
			accept(event.streamId, {
				timestamp: last.timestamp,
				receivedAt: Date.now() / 1000,
				values: last.values
			});
		});
		return () => {
			controller.abort();
			clearInterval(timer);
			unsubscribe();
		};
	});

	return {
		get latest() {
			return latest;
		},
		get error() {
			return error;
		},
		get mode() {
			return modes.mode;
		}
	};
}

const TRACK_LIMIT = 10_000;

/**
 * Time-ordered samples of one stream: the realtime or fixed window, or the
 * run up to the replay playhead.
 */
export function useStreamTrack(streamId: () => string, liveWindowSeconds: () => number) {
	const project = fromStore(currentProject);
	const modes = modeState();
	let samples = $state.raw<TimedValues[]>([]);
	let error = $state('');

	$effect(() => {
		if (modes.mode !== 'replay') return;
		const id = streamId();
		const playhead = modes.playhead;
		samples = id ? (replaySamplesForStream(id, { to: playhead }) ?? []).map(toTimed) : [];
	});

	$effect(() => {
		if (modes.mode !== 'history') return;
		const projectId = project.current?.id;
		const id = streamId();
		const from = modes.windowStart;
		const to = modes.playhead;
		if (!projectId || !id) return;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const rows = await fetchSamples(
					projectId,
					id,
					{ from, to, limit: TRACK_LIMIT },
					controller.signal
				);
				samples = rows.map(toTimed);
				error = '';
			} catch (cause) {
				if (!controller.signal.aborted) error = (cause as Error).message;
			}
		}, HISTORY_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	$effect(() => {
		if (modes.mode !== 'live') return;
		const projectId = project.current?.id;
		const id = streamId();
		const windowSeconds = liveWindowSeconds();
		if (!projectId || !id) {
			samples = [];
			return;
		}
		const controller = new AbortController();
		let buffer: TimedValues[] = [];
		let flushTimer: ReturnType<typeof setTimeout> | null = null;
		const flush = () => {
			flushTimer = null;
			const cutoff = (buffer.at(-1)?.timestamp ?? 0) - windowSeconds;
			buffer = buffer.filter((sample) => sample.timestamp >= cutoff).slice(-TRACK_LIMIT);
			samples = buffer;
		};
		const queue = (next: TimedValues[]) => {
			for (const sample of next) {
				if (buffer.length && sample.timestamp < buffer[buffer.length - 1].timestamp) {
					buffer = [...buffer, sample].sort((a, b) => a.timestamp - b.timestamp);
				} else buffer.push(sample);
			}
			flushTimer ??= setTimeout(flush, 100);
		};
		fetchSamples(
			projectId,
			id,
			{ from: Date.now() / 1000 - windowSeconds, limit: TRACK_LIMIT },
			controller.signal
		)
			.then((rows) => {
				const seeded = rows.map(toTimed);
				const newestSeed = seeded.at(-1)?.timestamp ?? -Infinity;
				buffer = [...seeded, ...buffer.filter((sample) => sample.timestamp > newestSeed)];
				flush();
				error = '';
			})
			.catch((cause) => {
				if (!controller.signal.aborted) error = (cause as Error).message;
			});
		const unsubscribe = subscribeSSE(projectId, id, (event) => {
			if (!('values' in event)) return;
			queue(
				(event.samples ?? [event]).map((sample) => ({
					timestamp: sample.timestamp,
					values: sample.values
				}))
			);
		});
		return () => {
			controller.abort();
			if (flushTimer) clearTimeout(flushTimer);
			unsubscribe();
		};
	});

	return {
		get samples() {
			return samples;
		},
		get error() {
			return error;
		},
		get mode() {
			return modes.mode;
		}
	};
}

/** Units declared in stream metadata, keyed by stream id then field. */
export function useStreamCatalog() {
	const project = fromStore(currentProject);
	let streams = $state<
		{ id: string; name: string; units: Record<string, string>; unit?: string }[]
	>([]);
	$effect(() => {
		const projectId = project.current?.id;
		if (!projectId) return;
		const controller = new AbortController();
		fetch(`/api/projects/${projectId}/streams`, { signal: controller.signal })
			.then((response) => (response.ok ? response.json() : []))
			.then((list: { id: string; name?: string; metadata?: Record<string, unknown> }[]) => {
				streams = list.map((stream) => {
					const metadata = stream.metadata ?? {};
					const units =
						metadata.units && typeof metadata.units === 'object'
							? (metadata.units as Record<string, string>)
							: {};
					return {
						id: stream.id,
						name: String(metadata.name ?? stream.name ?? stream.id),
						units,
						unit:
							typeof metadata.units === 'string'
								? metadata.units
								: typeof metadata.unit === 'string'
									? metadata.unit
									: undefined
					};
				});
			})
			.catch(() => {});
		return () => controller.abort();
	});
	return {
		get streams() {
			return streams;
		},
		unitFor(streamId: string, field: string): string {
			const stream = streams.find((candidate) => candidate.id === streamId);
			return stream?.units[field] ?? (field === 'value' ? (stream?.unit ?? '') : '');
		},
		nameFor(streamId: string): string {
			return streams.find((candidate) => candidate.id === streamId)?.name ?? streamId;
		}
	};
}
