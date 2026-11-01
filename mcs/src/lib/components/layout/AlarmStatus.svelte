<script lang="ts">
	import { currentProject } from '$lib/stores/project.js';
	import { subscribeSSE } from '$lib/sse-manager.js';

	type Alarm = { id: string; ts: number; label: string; severity: 'yellow' | 'red' };
	let open = $state<Alarm[]>([]);

	const critical = $derived(open.filter((alarm) => alarm.severity === 'red').length);

	async function load(projectId: string, signal?: AbortSignal) {
		const to = Date.now() / 1000 + 60;
		try {
			const response = await fetch(
				`/api/projects/${projectId}/limit-events?from=${to - 7 * 86_400}&to=${to}&unackedOnly=true`,
				{ signal }
			);
			if (response.ok) {
				open = ((await response.json()) as Alarm[]).sort((a, b) => b.ts - a.ts);
			}
		} catch {
			// Keep the last known list while the server is unreachable.
		}
	}

	$effect(() => {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		const controller = new AbortController();
		void load(projectId, controller.signal);
		const timer = setInterval(() => void load(projectId, controller.signal), 10_000);
		const unsubscribe = subscribeSSE(projectId, '*', (event) => {
			if (!('type' in event) || event.type !== 'limit') return;
			if (open.some((alarm) => alarm.id === event.event.id)) return;
			open = [event.event, ...open];
		});
		return () => {
			controller.abort();
			clearInterval(timer);
			unsubscribe();
		};
	});

	async function acknowledge(id?: string) {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		const response = id
			? await fetch(`/api/projects/${projectId}/limit-events/${id}`, { method: 'PATCH' })
			: await fetch(`/api/projects/${projectId}/limit-events?action=ack-all`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}'
				});
		if (response.ok) open = id ? open.filter((alarm) => alarm.id !== id) : [];
	}

	const utc = (ts: number) => new Date(ts * 1000).toISOString().slice(11, 19);
</script>

<details class="alarm-status" class:active={open.length > 0} class:critical={critical > 0}>
	<summary
		aria-label={open.length === 0
			? 'No open alarms'
			: `${open.length} open alarm${open.length === 1 ? '' : 's'}, ${critical} critical`}
	>
		<span class="mark" aria-hidden="true"></span>
		<span class="summary"
			>{open.length === 0
				? 'No alarms'
				: `${open.length} alarm${open.length === 1 ? '' : 's'}`}</span
		>
	</summary>
	<div class="alarm-list">
		{#if open.length === 0}
			<p>No limit violations are waiting for acknowledgement.</p>
		{:else}
			<ul>
				{#each open.slice(0, 8) as alarm (alarm.id)}
					<li>
						<span class="tag {alarm.severity}">{alarm.severity === 'red' ? 'CRIT' : 'WARN'}</span>
						<time>{utc(alarm.ts)}</time>
						<span class="label">{alarm.label}</span>
						<button type="button" onclick={() => acknowledge(alarm.id)}>Acknowledge</button>
					</li>
				{/each}
			</ul>
			<div class="footer">
				{#if open.length > 8}<span>{open.length - 8} more in Alarms &amp; Log</span>{/if}
				<button type="button" onclick={() => acknowledge()}>Acknowledge all</button>
			</div>
		{/if}
	</div>
</details>

<style>
	.alarm-status {
		position: relative;
		flex: 0 0 auto;
		font-size: 0.7rem;
	}
	summary {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 1.75rem;
		padding: 0 0.25rem;
		color: var(--mcs-text-muted);
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.summary {
		font-family: var(--mcs-font-mono);
	}
	.mark {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--mcs-border);
	}
	.active summary {
		color: var(--mcs-warning);
		font-weight: 600;
	}
	.active .mark {
		background: var(--mcs-warning);
	}
	.critical summary {
		color: var(--mcs-danger);
	}
	.critical .mark {
		background: var(--mcs-danger);
		animation: alarm-pulse 1s ease-in-out infinite;
	}
	@keyframes alarm-pulse {
		50% {
			opacity: 0.25;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.critical .mark {
			animation: none;
		}
	}
	.alarm-list {
		position: absolute;
		z-index: 20;
		left: 0;
		bottom: calc(100% + 0.45rem);
		width: min(34rem, calc(100vw - 2rem));
		padding: 0.5rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
	}
	p {
		margin: 0;
		padding: 0.4rem;
		color: var(--mcs-text-muted);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.4rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	time,
	.label {
		font-family: var(--mcs-font-mono);
	}
	time {
		color: var(--mcs-text-muted);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag {
		padding: 0 4px;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 600;
	}
	.tag.red {
		color: var(--mcs-danger);
	}
	.tag.yellow {
		color: var(--mcs-warning);
	}
	.footer {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.75rem;
		padding: 0.4rem 0.4rem 0;
		color: var(--mcs-text-muted);
	}
	button {
		padding: 1px 6px;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-bg);
		color: var(--mcs-text);
		font: inherit;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
</style>
