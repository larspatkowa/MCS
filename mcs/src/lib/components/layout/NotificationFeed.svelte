<script lang="ts">
	import {
		filteredNotifications,
		notificationFilters,
		unackedCount,
		ackNotification,
		ackAllNotifications,
		dismissNotification,
		type Notification
	} from '$lib/stores/notifications';
	import { Bell, BellOff, CheckCheck, X, AlertTriangle, AlertCircle, Info } from '@lucide/svelte';
	import { formatDateTime } from '$lib/date-time-format';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { currentProject } from '$lib/stores/project';

	const effectiveOptions = $derived(
		getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime)
	);

	function formatTs(ts: number): string {
		return formatDateTime(new Date(ts * 1000), effectiveOptions);
	}

	function severityIcon(sev: Notification['severity']) {
		if (sev === 'red') return AlertCircle;
		if (sev === 'yellow') return AlertTriangle;
		return Info;
	}

	function toggleFilter(key: keyof typeof $notificationFilters) {
		notificationFilters.update((f) => ({ ...f, [key]: !f[key] }));
	}
</script>

<div class="feed">
	<!-- Header -->
	<div class="feed-header">
		<span class="feed-title">
			<Bell size={13} />
			Notifications
			{#if $unackedCount > 0}
				<span class="badge badge-red">{$unackedCount > 99 ? '99+' : $unackedCount}</span>
			{/if}
		</span>
		<div class="feed-actions">
			<button
				type="button"
				class="action-btn"
				title="Acknowledge all"
				disabled={$unackedCount === 0}
				onclick={ackAllNotifications}
			>
				<CheckCheck size={13} />
			</button>
		</div>
	</div>

	<!-- Filters -->
	<div class="filters">
		<button
			type="button"
			class="filter-chip"
			class:active={$notificationFilters.limit}
			onclick={() => toggleFilter('limit')}
		>
			Limits
		</button>
		<button
			type="button"
			class="filter-chip"
			class:active={$notificationFilters.system}
			onclick={() => toggleFilter('system')}
		>
			System
		</button>
		<button
			type="button"
			class="filter-chip"
			class:active={$notificationFilters.unackedOnly}
			onclick={() => toggleFilter('unackedOnly')}
		>
			Unacked
		</button>
	</div>

	<!-- Feed list -->
	<div class="feed-list">
		{#if $filteredNotifications.length === 0}
			<div class="empty">
				<BellOff size={20} />
				<span>No notifications</span>
			</div>
		{:else}
			{#each $filteredNotifications as n (n.id)}
				{@const Icon = severityIcon(n.severity)}
				<div
					class="feed-item"
					class:acked={n.ackedAt !== null}
					class:sev-red={n.severity === 'red'}
					class:sev-yellow={n.severity === 'yellow'}
				>
					<span class="feed-item-icon">
						<Icon size={13} />
					</span>
					<div class="feed-item-body">
						<span class="feed-item-label">{n.label}</span>
						{#if n.streamId}
							<span class="feed-item-meta"
								>{n.streamId}{n.field && n.field !== 'value' ? `/${n.field}` : ''}</span
							>
						{/if}
						<span class="feed-item-time">{formatTs(n.ts)}</span>
					</div>
					<div class="feed-item-actions">
						{#if n.ackedAt === null}
							<button
								type="button"
								class="item-btn"
								title="Acknowledge"
								onclick={() => ackNotification(n.id)}
							>
								<CheckCheck size={11} />
							</button>
						{/if}
						<button
							type="button"
							class="item-btn"
							title="Dismiss"
							onclick={() => dismissNotification(n.id)}
						>
							<X size={11} />
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.feed {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--mcs-surface);
	}

	.feed-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--mcs-header-action-inset);
		height: var(--mcs-header-height);
		min-height: var(--mcs-header-height);
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}

	.feed-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.15rem;
		height: 1.15rem;
		padding: 0 0.25rem;
		border-radius: 0.6rem;
		font-size: 0.62rem;
		font-weight: 700;
		font-family: var(--mcs-font-mono);
		line-height: 1;
	}

	.badge-red {
		background: color-mix(in srgb, #ef4444 20%, transparent);
		color: #ef4444;
		border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
	}

	.feed-actions {
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--mcs-header-toggle-size);
		height: var(--mcs-header-toggle-size);
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		padding: 0;
		cursor: pointer;
		border-radius: var(--mcs-radius);
		transition:
			background 80ms,
			color 80ms;
	}

	.action-btn:hover:not(:disabled) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}

	.action-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.filters {
		display: flex;
		gap: 0.3rem;
		padding: 0.4rem 0.6rem;
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}

	.filter-chip {
		display: inline-flex;
		align-items: center;
		height: 1.3rem;
		padding: 0 0.45rem;
		border-radius: 0.65rem;
		font-size: 0.62rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text-muted);
		cursor: pointer;
		transition: all 80ms;
	}

	.filter-chip.active {
		background: color-mix(in srgb, var(--mcs-accent) 15%, transparent);
		border-color: color-mix(in srgb, var(--mcs-accent) 40%, transparent);
		color: var(--mcs-accent);
	}

	.feed-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 6rem;
		color: var(--mcs-text-muted);
		font-size: 0.76rem;
		opacity: 0.6;
	}

	.feed-item {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid var(--mcs-border);
		border-left: 3px solid transparent;
		transition: background 80ms;
		cursor: default;
	}

	.feed-item:last-child {
		border-bottom: none;
	}

	.feed-item:hover {
		background: var(--mcs-surface-alt);
	}

	.feed-item.acked {
		opacity: 0.45;
	}

	.feed-item.sev-red {
		border-left-color: #ef4444;
	}

	.feed-item.sev-yellow {
		border-left-color: #f59e0b;
	}

	.feed-item-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		margin-top: 0.05rem;
		color: var(--mcs-text-muted);
	}

	.feed-item.sev-red .feed-item-icon {
		color: #ef4444;
	}

	.feed-item.sev-yellow .feed-item-icon {
		color: #f59e0b;
	}

	.feed-item-body {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1;
		min-width: 0;
	}

	.feed-item-label {
		font-size: 0.73rem;
		font-weight: 500;
		color: var(--mcs-text);
		line-height: 1.3;
		word-break: break-word;
	}

	.feed-item-meta {
		font-size: 0.65rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		opacity: 0.8;
	}

	.feed-item-time {
		font-size: 0.62rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		opacity: 0.65;
	}

	.feed-item-actions {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.item-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		padding: 0;
		cursor: pointer;
		border-radius: 3px;
		opacity: 0.6;
		transition:
			opacity 80ms,
			background 80ms;
	}

	.item-btn:hover {
		opacity: 1;
		background: var(--mcs-surface-alt);
	}
</style>
