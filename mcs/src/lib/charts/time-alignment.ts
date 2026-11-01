export interface TimeOrderedSample {
	timestamp: number;
	eventId?: number;
}

function compareSamples<T extends TimeOrderedSample>(left: T, right: T): number {
	const timeDifference = left.timestamp - right.timestamp;
	if (timeDifference !== 0) return timeDifference;
	if (left.eventId !== undefined && right.eventId !== undefined) {
		return left.eventId - right.eventId;
	}
	if (left.eventId === undefined && right.eventId !== undefined) return -1;
	if (left.eventId !== undefined && right.eventId === undefined) return 1;
	return 0;
}

/** Merge event-time-ordered samples and ignore repeats of a durable event ID. */
export function mergeTimeOrderedSamples<T extends TimeOrderedSample>(
	existing: readonly T[],
	incoming: readonly T[],
	maxSamples: number
): T[] {
	const seenIds = new Set(
		existing.flatMap((sample) => (sample.eventId === undefined ? [] : [sample.eventId]))
	);
	const additions = incoming
		.filter((sample) => {
			if (sample.eventId === undefined) return true;
			if (seenIds.has(sample.eventId)) return false;
			seenIds.add(sample.eventId);
			return true;
		})
		.map((sample, index) => ({ sample, index }))
		.sort((left, right) => compareSamples(left.sample, right.sample) || left.index - right.index)
		.map(({ sample }) => sample);

	const merged: T[] = [];
	let oldIndex = 0;
	let newIndex = 0;
	while (oldIndex < existing.length || newIndex < additions.length) {
		if (oldIndex >= existing.length) merged.push(additions[newIndex++]);
		else if (newIndex >= additions.length) merged.push(existing[oldIndex++]);
		else if (compareSamples(existing[oldIndex], additions[newIndex]) <= 0) {
			merged.push(existing[oldIndex++]);
		} else {
			merged.push(additions[newIndex++]);
		}
	}
	const boundedLimit = Number.isInteger(maxSamples) && maxSamples > 0 ? maxSamples : merged.length;
	return merged.slice(Math.max(0, merged.length - boundedLimit));
}

/** Find the newest sample at or before a timestamp in an ordered series. */
export function latestAtOrBefore<T extends TimeOrderedSample>(
	samples: readonly T[],
	timestamp: number
): T | undefined {
	let lower = 0;
	let upper = samples.length;
	while (lower < upper) {
		const middle = lower + Math.floor((upper - lower) / 2);
		if (samples[middle].timestamp <= timestamp) lower = middle + 1;
		else upper = middle;
	}
	return lower === 0 ? undefined : samples[lower - 1];
}
