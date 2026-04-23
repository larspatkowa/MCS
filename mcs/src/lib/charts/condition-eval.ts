/**
 * Shared condition evaluation logic.
 * Used by ConditionSetView, SummaryWidgetView, and FlexLayout visibility rules.
 *
 * Supports both frontend sample streams and real SSE streams via a simple
 * value cache that components can write to.
 */

import type { ConditionOp, VisibilityRule } from '$lib/objects/types.js';
import { getSampleStreamValue, isSampleStreamId } from '$lib/charts/sample-streams.js';

/**
 * Simple latest-value cache for SSE/plugin streams.
 * Components subscribing to SSE can call `setStreamValue()` to
 * keep the cache up to date; `getStreamValue()` reads from it.
 */
const sseValueCache = new Map<string, number>();

/** Update the cached value for a stream (call from SSE handlers). */
export function setStreamValue(streamId: string, value: number): void {
	sseValueCache.set(streamId, value);
}

/**
 * Evaluate a single comparison.
 */
export function evalOp(
	op: ConditionOp,
	current: number,
	threshold: number,
	threshold2?: number
): boolean {
	switch (op) {
		case 'gt':
			return current > threshold;
		case 'lt':
			return current < threshold;
		case 'gte':
			return current >= threshold;
		case 'lte':
			return current <= threshold;
		case 'eq':
			return current === threshold;
		case 'neq':
			return current !== threshold;
		case 'between':
			return current >= threshold && current <= (threshold2 ?? threshold);
		default:
			return false;
	}
}

/**
 * Get the current numeric value for a stream. Returns NaN if unavailable.
 */
export function getStreamValue(streamId: string): number {
	if (isSampleStreamId(streamId)) {
		return getSampleStreamValue(streamId);
	}
	// Check SSE value cache
	const cached = sseValueCache.get(streamId);
	if (cached !== undefined) return cached;
	return NaN;
}

/**
 * Evaluate an array of visibility rules. Returns true if the pane should be visible.
 * Empty rules array → always visible.
 */
export function evaluateVisibilityRules(rules: VisibilityRule[] | undefined): boolean {
	if (!rules || rules.length === 0) return true;

	let combinedResult: boolean | null = null;

	for (const rule of rules) {
		const val = getStreamValue(rule.streamId);
		if (isNaN(val)) continue; // skip unavailable streams

		const result = evalOp(rule.op, val, rule.value ?? 0, rule.value2);
		const join = rule.join ?? 'and';

		if (combinedResult === null) {
			combinedResult = result;
		} else if (join === 'or') {
			combinedResult = combinedResult || result;
		} else {
			combinedResult = combinedResult && result;
		}
	}

	return combinedResult ?? true;
}
