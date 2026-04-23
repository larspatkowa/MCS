<script lang="ts">
	import {
		notifications,
		ackNotification,
		ackAllNotifications,
		dismissNotification,
		type Notification
	} from '$lib/stores/notifications';
	import { Bell, BellOff, CheckCheck, X, AlertTriangle, AlertCircle, Info } from '@lucide/svelte';
	import { formatDateTime } from '$lib/date-time-format';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { currentProject } from '$lib/stores/project';

	let { objectId, props } = $props<{
		objectId: string;
		props: {
			severityFilter?: string;
			sourceFilter?: string;
			streamFilter?: string;
			unackedOnly?: boolean;
			maxItems?: number;
			label?: string;
		};
	}>();

	const severityFilter = $derived((props?.severityFilter ?? 'all') as string);
	const sourceFilter = $derived((props?.sourceFilter ?? 'all') as string);
	const streamFilter = $derived((props?.streamFilter ?? '') as string);
	const unackedOnly = $derived(props?.unackedOnly === true);
	const maxItems = $derived(Number(props?.maxItems) || 100);
	const label = $derived((props?.label as string) || 'Notifications');

	const effectiveOptions = $derived(
		getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime)
	);

	const filtered = $derived.by(() => {
		let list = $notifications;

		// Severity filter
		if (severityFilter !== 'all') {
			list = list.filter((n) => n.severity === severityFilter);
		}

		// Source filter
		if (sourceFilter !== 'all') {
			list = list.filter((n) => n.source === sourceFilter);
		}

		// Stream filter
		if (streamFilter.trim()) {
			list = list.filter((n) => n.streamId === streamFilter.trim());
		}

		// Unacked only
		if (unackedOnly) {
			list = list.filter((n) => n.ackedAt === null);
		}

		return list.slice(0, maxItems);
	});

	const unackedInView = $derived(filtered.filter((n) => n.ackedAt === null).length);

	function formatTs(ts: number): string {
		return formatDateTime(new Date(ts * 1000), effectiveOptions);
	}

	function severityIcon(sev: Notification['severity']) {
		if (sev === 'red') return AlertCircle;
		if (sev === 'yellow') return AlertTriangle;
		return Info;
	}

	function ackAllVisible() {
		filtered.forEach((n) => {
			if (n.ackedAt === null) ackNotification(n.id);
		});
	}
</script>

<div class="nd-root">
	<div class="nd-header">
		<span class="nd-title">
			<Bell size={13} />
			{label}
			{#if unackedInView > 0}
				<span class="nd-badge">{unackedInView > 99 ? '99+' : unackedInView}</span>
			{/if}
		</span>
		<div class="nd-actions">
			{#if severityFilter !== 'all' || sourceFilter !== 'all' || streamFilter}
				<span class="nd-filter-hint" title="Filters active">filtered</span>
			{/if}
			<button
				type="button"
				class="nd-btn"
				title="Acknowledge all visible"
				disabled={unackedInView === 0}
				onclick={ackAllVisible}
			>
				<CheckCheck size={13} />
			</button>
		</div>
	</div>

	<div class="nd-list">
		{#if filtered.length === 0}
			<div class="nd-empty">
				<BellOff size={18} />
				<span>No notifications</span>
			</div>
		{:else}
			{#each filtered as n (n.id)}
				{@const Icon = severityIcon(n.severity)}
				<div
					class="nd-item"
					class:acked={n.ackedAt !== null}
					class:sev-red={n.severity === 'red'}
					class:sev-yellow={n.severity === 'yellow'}
				>
					<span class="nd-icon">
						<Icon size={12} />
					</span>
					<div class="nd-body">
						<span class="nd-label">{n.label}</span>
						{#if n.streamId}
							<span class="nd-meta"
								>{n.streamId}{n.field && n.field !== 'value' ? `/${n.field}` : ''}</span
							>
						{/if}
						<span class="nd-time">{formatTs(n.ts)}</span>
					</div>
					<div class="nd-item-actions">
						{#if n.ackedAt === null}
							<button
								type="button"
								class="nd-btn-sm"
								title="Acknowledge"
								onclick={() => ackNotification(n.id)}
							>
								<CheckCheck size={10} />
							</button>
						{/if}
						<button
							type="button"
							class="nd-btn-sm"
							title="Dismiss"
							onclick={() => dismissNotification(n.id)}
						>
							<X size={10} />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.nd-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--mcs-surface);
	}

	.nd-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.65rem;
		height: 2rem;
		min-height: 2rem;
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
		gap: 0.5rem;
	}

	.nd-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}

	.nd-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1rem;
		height: 1rem;
		padding: 0 0.2rem;
		background: #ef4444;
		color: #fff;
		border-radius: 0.5rem;
		font-size: 0.6rem;
		font-weight: 700;
		font-family: var(--mcs-font-mono);
	}

	.nd-filter-hint {
		font-size: 0.6rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-accent);
		opacity: 0.8;
	}

	.nd-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.nd-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		background: transparent;
		border: none;
		border-radius: var(--mcs-radius);
		color: var(--mcs-text-muted);
		cursor: pointer;
		padding: 0;
	}
	.nd-btn:hover:not(:disabled) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.nd-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.nd-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.nd-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 100%;
		min-height: 5rem;
		color: var(--mcs-text-muted);
		font-size: 0.8rem;
	}

	.nd-item {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.35rem 0.65rem;
		border-bottom: 1px solid var(--mcs-border);
		transition: background 80ms;
	}
	.nd-item:hover {
		background: var(--mcs-surface-alt);
	}
	.nd-item.acked {
		opacity: 0.45;
	}
	.nd-item.sev-red .nd-icon {
		color: #ef4444;
	}
	.nd-item.sev-yellow .nd-icon {
		color: #f59e0b;
	}

	.nd-icon {
		flex-shrink: 0;
		margin-top: 0.1rem;
		color: var(--mcs-text-muted);
	}

	.nd-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
	}

	.nd-label {
		font-size: 0.78rem;
		color: var(--mcs-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nd-meta {
		font-size: 0.68rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nd-time {
		font-size: 0.65rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		opacity: 0.7;
	}

	.nd-item-actions {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 80ms;
	}
	.nd-item:hover .nd-item-actions {
		opacity: 1;
	}

	.nd-btn-sm {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		background: transparent;
		border: none;
		border-radius: var(--mcs-radius);
		color: var(--mcs-text-muted);
		cursor: pointer;
		padding: 0;
	}
	.nd-btn-sm:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
</style>
