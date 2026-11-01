import { derived, get, writable } from 'svelte/store';
import {
	configureReplaySession,
	exitReplaySession,
	orderReplaySamples,
	replayUpperBound
} from './replay-session.js';

const REPLAY_PAGE_LIMIT = 50_000;
const MAX_REPLAY_EVENTS = 1_000_000;

export type RunStatus = 'recording' | 'paused' | 'finalized';
export type RunMode = 'live' | 'recording' | 'paused' | 'replaying';

export interface Run {
	id: string;
	status: RunStatus;
	startedAt: number;
	endedAt: number | null;
	pausedAt: number | null;
	resumedAt: number | null;
	sampleCount: number;
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export interface ReplaySample {
	timestamp: number;
	value: number;
	kind: 'raw' | 'derived';
	/** Stable event order used when a supplier emits equal timestamps. */
	sequence?: number;
	[key: string]: unknown;
}

export interface ReplaySeries {
	streamId: string;
	kind: 'raw' | 'derived';
	data: ReplaySample[];
}

export interface RunReplay {
	run: Run;
	streams: ReplaySeries[];
}

export const activeRun = writable<Run | null>(null);
export const recentRuns = writable<Run[]>([]);
export const replayData = writable<RunReplay | null>(null);
export const replayRunId = writable<string | null>(null);
export const runError = writable<string | null>(null);
export const runBusy = writable(false);

export const runMode = derived([activeRun, replayRunId], ([$activeRun, $replayRunId]): RunMode => {
	if ($replayRunId) return 'replaying';
	if ($activeRun?.status === 'recording') return 'recording';
	if ($activeRun?.status === 'paused') return 'paused';
	return 'live';
});

const stateRequests = new Map<string, Promise<void>>();

async function readError(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { error?: unknown };
		if (typeof body.error === 'string' && body.error) return body.error;
	} catch {
		// Fall through to the status text.
	}
	return response.statusText || `Request failed (${response.status})`;
}

export async function refreshRunState(projectId: string): Promise<void> {
	const existing = stateRequests.get(projectId);
	if (existing) return existing;
	const request = (async () => {
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/runs`);
			if (!response.ok) throw new Error(await readError(response));
			const body = (await response.json()) as { active: Run | null; runs: Run[] };
			activeRun.set(body.active ?? null);
			recentRuns.set(Array.isArray(body.runs) ? body.runs : []);
			runError.set(null);
		} catch (error) {
			runError.set(error instanceof Error ? error.message : 'Unable to load run state');
		} finally {
			stateRequests.delete(projectId);
		}
	})();
	stateRequests.set(projectId, request);
	return request;
}

async function runAction(
	projectId: string,
	path: string,
	body: Record<string, unknown> = {}
): Promise<Run> {
	runBusy.set(true);
	runError.set(null);
	try {
		const response = await fetch(path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(await readError(response));
		const run = (await response.json()) as Run;
		await refreshRunState(projectId);
		return run;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Run action failed';
		runError.set(message);
		throw error;
	} finally {
		runBusy.set(false);
	}
}

export function startRecording(projectId: string): Promise<Run> {
	exitRunReplay();
	return runAction(projectId, `/api/projects/${encodeURIComponent(projectId)}/runs`, {
		action: 'start'
	});
}

export function pauseRecording(projectId: string, runId: string): Promise<Run> {
	return runAction(
		projectId,
		`/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
		{ action: 'pause' }
	);
}

export function resumeRecording(projectId: string, runId: string): Promise<Run> {
	return runAction(
		projectId,
		`/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
		{ action: 'resume' }
	);
}

export function stopRecording(projectId: string, runId: string): Promise<Run> {
	return runAction(
		projectId,
		`/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
		{ action: 'stop' }
	);
}

export async function startRunReplay(projectId: string, runId: string): Promise<RunReplay> {
	runBusy.set(true);
	runError.set(null);
	try {
		const base = `/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`;
		const firstResponse = await fetch(`${base}/events?limit=${REPLAY_PAGE_LIMIT}`);
		if (!firstResponse.ok) throw new Error(await readError(firstResponse));
		const firstPage = (await firstResponse.json()) as {
			run: Run;
			events: Array<{
				streamId: string;
				kind: 'raw' | 'derived';
				timestamp: number;
				values: Record<string, unknown>;
			}>;
			nextCursor: string | null;
			hasMore: boolean;
		};
		const events = [...(Array.isArray(firstPage.events) ? firstPage.events : [])];
		if (events.length > MAX_REPLAY_EVENTS)
			throw new Error('Run replay exceeds the supported event limit');
		let cursor = firstPage.nextCursor;
		let hasMore = firstPage.hasMore;
		const seenCursors = new Set<string>();
		const maxPages = 1_000;
		let pageCount = 1;
		while (hasMore && cursor) {
			if (pageCount >= maxPages) throw new Error('Run replay contains too many event pages');
			if (seenCursors.has(cursor)) throw new Error('Run event cursor did not advance');
			seenCursors.add(cursor);
			const response = await fetch(
				`${base}/events?limit=${REPLAY_PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`
			);
			if (!response.ok) throw new Error(await readError(response));
			const page = (await response.json()) as typeof firstPage;
			events.push(...(Array.isArray(page.events) ? page.events : []));
			if (events.length > MAX_REPLAY_EVENTS)
				throw new Error('Run replay exceeds the supported event limit');
			cursor = page.nextCursor;
			hasMore = page.hasMore;
			pageCount += 1;
		}
		const seriesByKey = new Map<string, ReplaySeries>();
		for (const [sequence, event] of events.entries()) {
			const key = `${event.streamId}\u0000${event.kind}`;
			const series = seriesByKey.get(key) ?? {
				streamId: event.streamId,
				kind: event.kind,
				data: []
			};
			const numeric = Object.values(event.values).find((value) => typeof value === 'number');
			series.data.push({
				timestamp: event.timestamp,
				kind: event.kind,
				...event.values,
				value: typeof numeric === 'number' ? numeric : Number.NaN,
				sequence
			});
			seriesByKey.set(key, series);
		}
		const replay: RunReplay = {
			run: firstPage.run,
			streams: [...seriesByKey.values()]
				.map((series) => ({ ...series, data: orderReplaySamples(series.data) }))
				.sort((a, b) => a.streamId.localeCompare(b.streamId) || a.kind.localeCompare(b.kind))
		};
		replayData.set(replay);
		replayRunId.set(replay.run.id);
		const timestamps = replay.streams.flatMap((series) =>
			series.data.map((sample) => sample.timestamp)
		);
		const start = timestamps.length > 0 ? Math.min(...timestamps) : replay.run.startedAt;
		const end =
			timestamps.length > 0
				? Math.max(...timestamps)
				: (replay.run.endedAt ?? replay.run.startedAt + 60);
		configureReplaySession({
			projectId,
			runId: replay.run.id,
			start,
			end: Math.max(start + 0.001, end)
		});
		return replay;
	} catch (error) {
		runError.set(error instanceof Error ? error.message : 'Unable to load run replay');
		throw error;
	} finally {
		runBusy.set(false);
	}
}

export function exitRunReplay(): void {
	replayRunId.set(null);
	replayData.set(null);
	exitReplaySession();
}

export function replaySamplesForStream(
	streamId: string,
	options: { kind?: 'raw' | 'derived'; to?: number } = {}
): ReplaySample[] | null {
	const replay = get(replayData);
	if (!replay) return null;
	const matching = replay.streams.filter(
		(series) => series.streamId === streamId && (!options.kind || series.kind === options.kind)
	);
	const selected = options.kind
		? matching
		: matching.some((series) => series.kind === 'raw')
			? matching.filter((series) => series.kind === 'raw')
			: matching;
	const samples = orderReplaySamples(selected.flatMap((series) => series.data));
	if (options.to === undefined) return samples;
	return samples.slice(0, replayUpperBound(samples, options.to));
}
