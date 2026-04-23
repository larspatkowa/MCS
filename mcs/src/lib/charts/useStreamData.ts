/**
 * Implementation of fetchStreamData
 */

import { currentProject } from '$lib/stores/project.js';
import { get } from 'svelte/store';

export async function fetchStreamData(
	streamIds: string[]
): Promise<Array<{ streamId: string; data: Array<{ timestamp: number; value: number }> }>> {
	const proj = get(currentProject);
	if (!proj) return [];

	const results = await Promise.all(
		streamIds.map(async (streamId) => {
			if (proj.id === 'gallery') {
				// Mock data for gallery
				const data = [];
				const now = Date.now() / 1000;
				for (let i = 0; i < 100; i++) {
					data.push({ timestamp: now - 100 + i, value: Math.random() * 100 });
				}
				return { streamId, data };
			}

			try {
				// Fetch last 1 hour of samples by default, up to 1000 points
				const to = Math.floor(Date.now() / 1000);
				const from = to - 3600;
				const res = await fetch(
					`/api/projects/${proj.id}/streams/${encodeURIComponent(streamId)}/samples?from=${from}&to=${to}&limit=1000`
				);
				if (!res.ok) return { streamId, data: [] };
				const json = await res.json();
				return { streamId, data: json.data || [] };
			} catch (e) {
				console.error('Failed to fetch stream data for', streamId, e);
				return { streamId, data: [] };
			}
		})
	);
	return results;
}
