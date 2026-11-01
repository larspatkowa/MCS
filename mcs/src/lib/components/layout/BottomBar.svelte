<script lang="ts">
	import TimelineStrip from '../timeline/TimelineStrip.svelte';
	import TimeConductor from '../timeline/TimeConductor.svelte';
	import RunControls from './RunControls.svelte';
	import SourceStatus from './SourceStatus.svelte';
	import AlarmStatus from './AlarmStatus.svelte';
	import { currentProject } from '$lib/stores/project';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { formatDateTime } from '$lib/date-time-format';
	import { timeConductorState } from '$lib/stores/timeline';

	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(id);
	});

	const effectiveOptions = $derived(
		// Mission time is UTC everywhere telemetry is shown, matching plots and tables.
		{
			...getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime),
			utc: true
		}
	);

	const formattedDateTime = $derived(formatDateTime(now, effectiveOptions));
	const isRealtime = $derived($timeConductorState.mode === 'realtime');
</script>

<div class="bottom-bar">
	<div class="bottom-bar-meta">
		<span class="time">
			{#if isRealtime}
				<span class="live-dot" title="Realtime"></span>
			{/if}
			{formattedDateTime}
		</span>
		{#if $currentProject}
			<RunControls />
			<TimeConductor />
			<SourceStatus />
			<AlarmStatus />
		{/if}
	</div>
	<div class="timeline-wrap">
		<TimelineStrip />
	</div>
</div>

<style>
	.bottom-bar {
		display: grid;
		grid-template-columns: minmax(18rem, max-content) minmax(0, 1fr);
		align-items: center;
		gap: 0.75rem;
		padding: 0.3rem 0.75rem;
		min-height: 2.8rem;
		background: var(--mcs-surface);
		font-size: 0.78rem;
		color: var(--mcs-text-muted);
	}
	.bottom-bar-meta {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.5rem 0.8rem;
		min-width: 0;
		overflow: visible;
	}
	@media (max-width: 1300px) {
		.bottom-bar {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.2rem;
		}
		.bottom-bar-meta {
			flex-wrap: wrap;
			overflow-x: visible;
		}
	}
	.time {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-family: var(--mcs-font-mono);
		font-size: 0.75rem;
		min-height: 1.75rem;
	}
	.live-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--mcs-accent);
		animation: live-pulse 2s ease-in-out infinite;
		flex-shrink: 0;
	}
	@keyframes live-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}
	.timeline-wrap {
		display: flex;
		align-items: center;
		min-width: 0;
		width: 100%;
	}
</style>
