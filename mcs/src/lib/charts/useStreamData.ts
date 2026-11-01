/**
 * Implementation of fetchStreamData
 */

import { currentProject } from '$lib/stores/project.js';
import { replayRunId, replaySamplesForStream } from '$lib/stores/run.js';
import { replayClock } from '$lib/stores/replay-session.js';
import { get } from 'svelte/store';

type Point = { timestamp: number; value: number; eventId?: number; receivedAt?: number };

const CACHE_TTL_MS = 500;
const responseCache = new Map<string, { expiresAt: number; data: Point[] }>();
const pendingRequests = new Map<string, Promise<Point[]>>();

export async function fetchStreamSamples(
	projectId: string,
	streamId: string,
	options: {
		from?: number;
		to?: number;
		limit?: number;
		afterEventId?: number;
		includeEventIds?: boolean;
		includeReceivedAt?: boolean;
		signal?: AbortSignal;
	} = {}
): Promise<Point[]> {
	const { from, to, limit, afterEventId, includeEventIds, includeReceivedAt, signal } = options;
	const replayState = get(replayClock);
	if (replayState.mode !== 'live' && get(replayRunId)) {
		const replay = replaySamplesForStream(streamId, {
			to: to ?? replayState.playhead
		});
		if (replay) {
			const data = replay
				.filter(
					(point) =>
						(from === undefined || point.timestamp >= from) &&
						(to === undefined || point.timestamp <= to)
				)
				.map((point) => ({ timestamp: point.timestamp, value: point.value }))
				.filter((point) => Number.isFinite(point.value));
			return limit && limit > 0 ? data.slice(-limit) : data;
		}
	}
	const key = `${projectId}\u0000${streamId}\u0000${from ?? ''}\u0000${to ?? ''}\u0000${limit ?? ''}\u0000${afterEventId ?? ''}\u0000${includeEventIds ? 'ids' : ''}\u0000${includeReceivedAt ? 'received' : ''}`;
	// Cursor queries are the live refresh path. Caching an empty response here
	// delays visibility until the cache expires, which is noticeable when an
	// operator configures polling faster than the historical-query cache TTL.
	const canShareRequest = afterEventId === undefined && signal === undefined;
	if (canShareRequest) {
		const cached = responseCache.get(key);
		if (cached && cached.expiresAt > Date.now()) return cached.data;
		const pending = pendingRequests.get(key);
		if (pending) return pending;
	}

	const request = (async () => {
		try {
			const query = new URLSearchParams();
			if (from !== undefined) query.set('from', String(from));
			if (to !== undefined) query.set('to', String(to));
			if (limit !== undefined) query.set('limit', String(limit));
			if (afterEventId !== undefined) query.set('afterEventId', String(afterEventId));
			if (includeEventIds) query.set('includeEventIds', '1');
			if (includeReceivedAt) query.set('includeReceivedAt', '1');
			const suffix = query.toString();
			const res = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/streams/${encodeURIComponent(streamId)}/samples${suffix ? `?${suffix}` : ''}`,
				{ signal }
			);
			if (!res.ok) throw new Error(`Stream history request failed (${res.status})`);
			const body = (await res.json()) as { data?: Point[] };
			const data = Array.isArray(body.data) ? body.data : [];
			if (canShareRequest) responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
			return data;
		} finally {
			if (canShareRequest) pendingRequests.delete(key);
		}
	})();
	if (canShareRequest) pendingRequests.set(key, request);
	return request;
}

async function fetchHistoricalStream(projectId: string, streamId: string): Promise<Point[]> {
	const to = Math.floor(Date.now() / 1000);
	return fetchStreamSamples(projectId, streamId, { from: to - 3600, to, limit: 1000 });
}

export async function fetchStreamData(
	streamIds: string[]
): Promise<Array<{ streamId: string; data: Array<{ timestamp: number; value: number }> }>> {
	const proj = get(currentProject);
	if (!proj) return [];
	const replaying = Boolean(get(replayRunId)) && get(replayClock).mode !== 'live';

	const results = await Promise.all(
		streamIds.map(async (streamId) => {
			if (replaying)
				return {
					streamId,
					data: replaySamplesForStream(streamId, { to: get(replayClock).playhead }) ?? []
				};

			return { streamId, data: await fetchHistoricalStream(proj.id, streamId) };
		})
	);
	return results;
}
