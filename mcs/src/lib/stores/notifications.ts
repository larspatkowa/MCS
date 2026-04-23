import { writable, derived, get } from 'svelte/store';
import { currentProject } from './project.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationSeverity = 'info' | 'yellow' | 'red';
export type NotificationSource = 'limit' | 'system' | 'ingest';

export interface Notification {
	id: string;
	source: NotificationSource;
	severity: NotificationSeverity;
	streamId?: string;
	field?: string;
	ts: number;
	label: string;
	ackedAt: string | null;
}

export interface NotificationFilters {
	limit: boolean;
	system: boolean;
	ingest: boolean;
	unackedOnly: boolean;
}

// ─── State ────────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 500;

export const notifications = writable<Notification[]>([]);
export const notificationFilters = writable<NotificationFilters>({
	limit: true,
	system: true,
	ingest: true,
	unackedOnly: false
});

export const unackedCount = derived(
	notifications,
	($n) => $n.filter((n) => n.ackedAt === null).length
);

export const filteredNotifications = derived([notifications, notificationFilters], ([$n, $f]) => {
	return $n.filter((n) => {
		if ($f.unackedOnly && n.ackedAt !== null) return false;
		if (n.source === 'limit' && !$f.limit) return false;
		if (n.source === 'system' && !$f.system) return false;
		if (n.source === 'ingest' && !$f.ingest) return false;
		return true;
	});
});

// ─── Actions ──────────────────────────────────────────────────────────────────

export function ackNotification(id: string): void {
	const proj = get(currentProject);
	if (!proj) return;
	const now = new Date().toISOString();
	notifications.update((list) => list.map((n) => (n.id === id ? { ...n, ackedAt: now } : n)));
	// Persist ack to server for limit events
	fetch(`/api/projects/${proj.id}/limit-events/${id}`, { method: 'PATCH' }).catch(() => {});
}

export function ackAllNotifications(): void {
	const proj = get(currentProject);
	if (!proj) return;
	const now = new Date().toISOString();
	notifications.update((list) => list.map((n) => ({ ...n, ackedAt: n.ackedAt ?? now })));
	fetch(`/api/projects/${proj.id}/limit-events?action=ack-all`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({})
	}).catch(() => {});
}

export function dismissNotification(id: string): void {
	notifications.update((list) => list.filter((n) => n.id !== id));
}

export function clearAllNotifications(): void {
	notifications.update((list) =>
		list.map((n) => ({ ...n, ackedAt: n.ackedAt ?? new Date().toISOString() }))
	);
}

function addNotification(n: Omit<Notification, 'ackedAt'>): void {
	const item: Notification = { ...n, ackedAt: null };
	notifications.update((list) => {
		const updated = [item, ...list];
		return updated.length > MAX_NOTIFICATIONS ? updated.slice(0, MAX_NOTIFICATIONS) : updated;
	});
}

// ─── SSE subscription ─────────────────────────────────────────────────────────

import { subscribeSSE } from '$lib/sse-manager.js';

let sseUnsub: (() => void) | null = null;
let sseProjectId: string | null = null;

interface LimitEventPayload {
	type: 'limit';
	event: {
		id: string;
		streamId: string;
		field: string;
		ts: number;
		value: number;
		severity: 'yellow' | 'red';
		label: string;
		ackedAt: string | null;
	};
}

export function connectNotificationSSE(projectId: string): void {
	if (sseProjectId === projectId && sseUnsub) return;
	disconnectNotificationSSE();
	sseProjectId = projectId;
	sseUnsub = subscribeSSE(projectId, '*', (event) => {
		if (!('type' in event) || event.type !== 'limit') return;
		const limitData = event as unknown as LimitEventPayload;
		const e = limitData.event;
		if (e.ackedAt) return;
		addNotification({
			id: e.id,
			source: 'limit',
			severity: e.severity,
			streamId: e.streamId,
			field: e.field,
			ts: e.ts,
			label: e.label
		});
	});
}

export function disconnectNotificationSSE(): void {
	sseUnsub?.();
	sseUnsub = null;
	sseProjectId = null;
}

/**
 * Load recent limit events from the server (last 1 hour) so the feed is populated on load.
 */
export async function loadRecentLimitEvents(projectId: string): Promise<void> {
	const now = Date.now() / 1000;
	const from = now - 3600;
	try {
		const res = await fetch(`/api/projects/${projectId}/limit-events?from=${from}&to=${now}`);
		if (!res.ok) return;
		const events = (await res.json()) as Array<{
			id: string;
			streamId: string;
			field: string;
			ts: number;
			value: number;
			severity: 'yellow' | 'red';
			label: string;
			ackedAt: string | null;
			createdAt: string;
		}>;
		notifications.update((existing) => {
			const existingIds = new Set(existing.map((n) => n.id));
			const fresh = events
				.filter((e) => !existingIds.has(e.id))
				.map(
					(e): Notification => ({
						id: e.id,
						source: 'limit',
						severity: e.severity,
						streamId: e.streamId,
						field: e.field,
						ts: e.ts,
						label: e.label,
						ackedAt: e.ackedAt
					})
				);
			return [...existing, ...fresh].sort((a, b) => b.ts - a.ts).slice(0, MAX_NOTIFICATIONS);
		});
	} catch {
		// network error — ignore
	}
}
