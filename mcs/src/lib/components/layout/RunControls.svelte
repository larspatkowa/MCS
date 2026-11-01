<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import {
		activeRun,
		exitRunReplay,
		recentRuns,
		replayRunId,
		runBusy,
		runError,
		runMode,
		pauseRecording,
		refreshRunState,
		resumeRecording,
		startRecording,
		startRunReplay,
		stopRecording
	} from '$lib/stores/run';

	let selectedRunId = $state('');

	$effect(() => {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		refreshRunState(projectId);
	});

	const finalizedRuns = $derived($recentRuns.filter((run) => run.status === 'finalized'));

	function labelForMode(mode: string): string {
		return mode.charAt(0).toUpperCase() + mode.slice(1);
	}

	async function doAction(action: 'start' | 'pause' | 'resume' | 'stop') {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		try {
			if (action === 'start') await startRecording(projectId);
			else if (!$activeRun) return;
			else if (action === 'pause') await pauseRecording(projectId, $activeRun.id);
			else if (action === 'resume') await resumeRecording(projectId, $activeRun.id);
			else await stopRecording(projectId, $activeRun.id);
		} catch {
			// The store exposes the operator-facing error.
		}
	}

	async function replaySelectedRun() {
		const projectId = $currentProject?.id;
		if (!projectId || !selectedRunId) return;
		try {
			await startRunReplay(projectId, selectedRunId);
		} catch {
			// The store exposes the operator-facing error.
		}
	}
</script>

<div class="run-controls" aria-label="Run controls">
	<span
		class="run-state"
		class:recording={$runMode === 'recording'}
		class:paused={$runMode === 'paused'}
	>
		{labelForMode($runMode)}
	</span>
	{#if $runMode === 'live'}
		<button
			type="button"
			class="control-button primary"
			disabled={$runBusy}
			onclick={() => doAction('start')}
		>
			Start recording
		</button>
	{:else if $runMode === 'recording'}
		<button
			type="button"
			class="control-button"
			disabled={$runBusy}
			onclick={() => doAction('pause')}
		>
			Pause
		</button>
		<button
			type="button"
			class="control-button"
			disabled={$runBusy}
			onclick={() => doAction('stop')}
		>
			Stop
		</button>
	{:else if $runMode === 'paused'}
		<button
			type="button"
			class="control-button primary"
			disabled={$runBusy}
			onclick={() => doAction('resume')}
		>
			Resume
		</button>
		<button
			type="button"
			class="control-button"
			disabled={$runBusy}
			onclick={() => doAction('stop')}
		>
			Stop
		</button>
	{:else}
		<button type="button" class="control-button" disabled={$runBusy} onclick={exitRunReplay}>
			Exit replay
		</button>
	{/if}

	{#if finalizedRuns.length > 0}
		<select
			class="run-select"
			aria-label="Recorded run"
			value={selectedRunId}
			onchange={(event) => (selectedRunId = (event.currentTarget as HTMLSelectElement).value)}
		>
			<option value="">Recorded run</option>
			{#each finalizedRuns as run}
				<option value={run.id}>
					{new Date(run.startedAt * 1000).toLocaleString()} · {run.sampleCount} samples
				</option>
			{/each}
		</select>
		{#if $runMode !== 'replaying'}
			<button
				type="button"
				class="control-button"
				disabled={!selectedRunId || $runBusy}
				onclick={replaySelectedRun}
			>
				Replay
			</button>
		{/if}
	{/if}

	{#if $runError}
		<span class="run-error" role="status">{$runError}</span>
	{/if}
</div>

<style>
	.run-controls {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 1.75rem;
		white-space: nowrap;
	}
	.run-state {
		padding: 0.18rem 0.45rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		color: var(--mcs-text);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: capitalize;
	}
	.run-state.recording {
		border-color: var(--mcs-danger);
		color: var(--mcs-danger);
	}
	.run-state.paused {
		border-color: var(--mcs-warning, #777777);
		color: var(--mcs-warning, #777777);
	}
	.control-button,
	.run-select {
		min-height: 1.65rem;
		padding: 0.15rem 0.45rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: transparent;
		color: var(--mcs-text-muted);
		font: inherit;
		font-size: 0.7rem;
	}
	.control-button {
		cursor: pointer;
	}
	.control-button:hover:not(:disabled),
	.control-button.primary {
		border-color: var(--mcs-accent);
		color: var(--mcs-accent);
	}
	.control-button:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.control-button:focus-visible,
	.run-select:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
	}
	.run-select {
		max-width: 12rem;
	}
	.run-error {
		max-width: 18rem;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--mcs-danger, #222222);
		font-size: 0.68rem;
	}
</style>
