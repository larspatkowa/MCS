<script lang="ts">
	import { currentProject } from '$lib/stores/project.js';

	type Source = {
		id: string;
		name: string;
		timeSystem: string;
		expectedPeriodMs: number | null;
		freshnessThresholdMs: number;
		status: 'empty' | 'fresh' | 'stale';
		lastReceivedAt: number | null;
		clockUncertaintyMs: number | null;
		lastClockQuality: string | null;
		lastClockUncertaintyMs: number | null;
		missingSequenceCount: number;
		openGapCount: number;
	};

	let sources = $state<Source[]>([]);
	let error = $state('');
	let loading = $state(true);
	let refreshGeneration = $state(0);
	let cadenceDrafts = $state<Record<string, string>>({});
	let savingSourceId = $state('');
	let saveError = $state('');
	let saveNotice = $state('');

	$effect(() => {
		const projectId = $currentProject?.id;
		refreshGeneration;
		if (!projectId) {
			sources = [];
			loading = false;
			return;
		}
		let active = true;
		const load = async () => {
			try {
				const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/sources`);
				if (!response.ok) throw new Error('Source status is unavailable');
				const body = await response.json();
				if (active) {
					sources = Array.isArray(body.sources) ? body.sources : [];
					error = '';
				}
			} catch (cause) {
				if (active) error = cause instanceof Error ? cause.message : 'Source status is unavailable';
			} finally {
				if (active) loading = false;
			}
		};
		loading = true;
		void load();
		const timer = setInterval(load, 5000);
		return () => {
			active = false;
			clearInterval(timer);
		};
	});

	const staleCount = $derived(sources.filter((source) => source.status === 'stale').length);
	const emptyCount = $derived(sources.filter((source) => source.status === 'empty').length);
	const gapCount = $derived(sources.reduce((sum, source) => sum + source.openGapCount, 0));
	const summary = $derived(
		error
			? 'Status unavailable'
			: loading && sources.length === 0
				? 'Checking sources…'
				: sources.length === 0
					? 'No sources'
					: `${sources.length - staleCount - emptyCount}/${sources.length} fresh`
	);

	async function saveExpectedPeriod(sourceId: string): Promise<void> {
		const projectId = $currentProject?.id;
		if (!projectId || savingSourceId) return;
		const rawValue = (cadenceDrafts[sourceId] ?? '').trim();
		const expectedPeriodMs = rawValue === '' ? null : Number(rawValue);
		if (expectedPeriodMs !== null && (!Number.isFinite(expectedPeriodMs) || expectedPeriodMs < 1)) {
			saveError = 'Expected sample period must be at least 1 ms, or blank.';
			saveNotice = '';
			return;
		}

		savingSourceId = sourceId;
		saveError = '';
		saveNotice = '';
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ expectedPeriodMs })
				}
			);
			if (!response.ok) throw new Error('Could not save the expected sample period.');
			delete cadenceDrafts[sourceId];
			saveNotice = 'Expected sample period saved.';
			refreshGeneration += 1;
		} catch (cause) {
			saveError =
				cause instanceof Error ? cause.message : 'Could not save the expected sample period.';
		} finally {
			savingSourceId = '';
		}
	}

	function age(seconds: number | null): string {
		if (seconds === null) return 'No samples received';
		const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
		if (elapsed < 60) return `${elapsed}s ago`;
		if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ago`;
		return `${Math.floor(elapsed / 3600)}h ago`;
	}
</script>

<details class="source-status" class:stale={staleCount > 0}>
	<summary aria-label={`Source health: ${summary}${gapCount ? `, ${gapCount} open gaps` : ''}`}>
		<span class="status-mark" aria-hidden="true"></span>
		<span>Sources</span>
		<span class="summary">{summary}</span>
		{#if gapCount > 0}<span class="gap-count">{gapCount} gaps</span>{/if}
	</summary>
	<div class="source-list" aria-live="polite">
		{#if saveError}<p class="source-error" role="status">{saveError}</p>{/if}
		{#if saveNotice}<p class="source-notice" role="status">{saveNotice}</p>{/if}
		{#if error}
			<p class="source-error" role="status">{error}</p>
			<button type="button" class="retry" onclick={() => (refreshGeneration += 1)}>Retry</button>
		{:else if sources.length === 0}
			<p>{loading ? 'Checking telemetry sources.' : 'No telemetry source has sent data yet.'}</p>
		{:else}
			{#each sources as source (source.id)}
				<div class="source-row">
					<span
						class="source-mark"
						class:fresh={source.status === 'fresh'}
						class:stale={source.status === 'stale'}
					></span>
					<span class="source-name">{source.name}</span>
					<span
						>{source.status === 'fresh'
							? 'Fresh'
							: source.status === 'stale'
								? 'Stale'
								: 'Empty'}</span
					>
					<span class="source-age">{age(source.lastReceivedAt)}</span>
					<span>{source.timeSystem} · Clock {source.lastClockQuality ?? 'unknown'}</span>
					<span
						>{(source.lastClockUncertaintyMs ?? source.clockUncertaintyMs) === null
							? 'uncertainty unknown'
							: `±${source.lastClockUncertaintyMs ?? source.clockUncertaintyMs} ms`}</span
					>
					{#if source.openGapCount > 0}<span class="gap-info"
							>{source.openGapCount} open gaps · {source.missingSequenceCount} missing</span
						>{/if}
					<div class="source-cadence">
						<label>
							Expected sample period (ms)
							<input
								type="number"
								min="1"
								step="1"
								aria-label={`${source.name} expected sample period in milliseconds`}
								value={cadenceDrafts[source.id] ?? String(source.expectedPeriodMs ?? '')}
								oninput={(event) =>
									(cadenceDrafts[source.id] = (event.currentTarget as HTMLInputElement).value)}
							/>
						</label>
						<button
							type="button"
							class="retry"
							aria-label={`Save expected sample period for ${source.name}`}
							disabled={Boolean(savingSourceId)}
							onclick={() => void saveExpectedPeriod(source.id)}
						>
							{savingSourceId === source.id ? 'Saving' : 'Save'}
						</button>
						<span>Marked stale after {source.freshnessThresholdMs} ms without a sample</span>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</details>

<style>
	.source-status {
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
	.status-mark,
	.source-mark {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--mcs-border);
	}
	.status-mark {
		background: var(--mcs-accent);
	}
	.source-status.stale .status-mark {
		background: var(--mcs-danger);
	}
	.summary {
		font-family: var(--mcs-font-mono);
	}
	.gap-count {
		color: var(--mcs-warning);
	}
	.source-list {
		position: absolute;
		z-index: 20;
		left: 0;
		bottom: calc(100% + 0.45rem);
		width: min(32rem, calc(100vw - 2rem));
		padding: 0.6rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
	}
	.source-list > p {
		margin: 0;
		padding: 0.4rem;
		color: var(--mcs-text-muted);
	}
	.source-error {
		color: var(--mcs-danger) !important;
	}
	.source-notice {
		margin: 0;
		padding: 0.4rem;
		color: var(--mcs-text-muted);
	}
	.source-row {
		display: grid;
		grid-template-columns: 0.5rem minmax(5rem, 1fr) auto auto auto auto;
		align-items: center;
		gap: 0.45rem;
		padding: 0.4rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	.source-row:last-child {
		border-bottom: 0;
	}
	.gap-info {
		grid-column: 2 / -1;
		color: var(--mcs-warning);
	}
	.source-mark.fresh {
		background: var(--mcs-text-muted);
	}
	.source-mark.stale {
		background: var(--mcs-danger);
	}
	.source-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.source-cadence {
		grid-column: 2 / -1;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		color: var(--mcs-text-muted);
	}
	.source-cadence label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.source-cadence input {
		width: 5.5rem;
		min-height: 1.75rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		padding: 0 0.35rem;
		background: var(--mcs-bg);
		color: var(--mcs-text);
		font: inherit;
	}
	.source-cadence .retry:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.source-age {
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}
	.retry {
		margin: 0.4rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--mcs-border);
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	@media (max-width: 700px) {
		.source-row {
			grid-template-columns: 0.5rem minmax(4rem, 1fr) auto;
		}
		.source-age,
		.source-row span:nth-child(4),
		.source-row span:nth-child(5),
		.source-row span:nth-child(6) {
			display: none;
		}
	}
</style>
