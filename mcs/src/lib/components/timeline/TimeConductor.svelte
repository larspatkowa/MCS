<script lang="ts">
	import {
		timeConductorState,
		timelineRange,
		getTimeBounds,
		setFixedBounds,
		setRealtimeWithPreset,
		shiftFixedWindow,
		type TimelineRangeId
	} from '$lib/stores/timeline';
	import { exitRunReplay } from '$lib/stores/run.js';
	import {
		replayClock,
		setReplaySpeed,
		startReplayClock,
		stopReplayClock,
		seekReplay
	} from '$lib/stores/replay-session.js';
	import { formatDateTime } from '$lib/date-time-format';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { currentProject } from '$lib/stores/project';
	import { Play, Pause } from '@lucide/svelte';
	import { onDestroy } from 'svelte';

	let replaySpeed = $state(1);

	function stopReplay() {
		stopReplayClock();
	}

	function startReplay() {
		if ($replayClock.mode === 'live') return;
		stopReplay();
		setReplaySpeed(replaySpeed);
		startReplayClock();
	}

	function toggleReplay() {
		if ($replayClock.playing) stopReplay();
		else startReplay();
	}

	function scrubReplay(event: Event) {
		if ($replayClock.mode === 'live') return;
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (Number.isFinite(value)) seekReplay(value);
	}

	onDestroy(stopReplay);

	const effectiveOptions = $derived(
		// Mission time is UTC everywhere telemetry is shown, matching plots and tables.
		{
			...getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime),
			utc: true
		}
	);

	function formatSec(sec: number): string {
		return formatDateTime(new Date(sec * 1000), effectiveOptions);
	}

	function setPresetToLast1h() {
		const now = Date.now() / 1000;
		setFixedBounds(now - 3600, now);
	}

	function setPresetToLast24h() {
		const now = Date.now() / 1000;
		setFixedBounds(now - 86400, now);
	}

	function enterHistory() {
		exitRunReplay();
		setFixedBounds($timeConductorState.fixedStart, $timeConductorState.fixedEnd);
	}

	function enterRealtime(range: TimelineRangeId = $timelineRange) {
		exitRunReplay();
		setRealtimeWithPreset(range);
	}

	function onFixedStartInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		const sec = new Date(v).getTime() / 1000;
		if (!Number.isNaN(sec)) {
			setFixedBounds(sec, $timeConductorState.fixedEnd);
		}
	}

	function onFixedEndInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		const sec = new Date(v).getTime() / 1000;
		if (!Number.isNaN(sec)) {
			setFixedBounds($timeConductorState.fixedStart, sec);
		}
	}

	function toDatetimeLocal(sec: number): string {
		const d = new Date(sec * 1000);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const h = String(d.getHours()).padStart(2, '0');
		const min = String(d.getMinutes()).padStart(2, '0');
		const secPart = String(d.getSeconds()).padStart(2, '0');
		const ms = String(d.getMilliseconds()).padStart(3, '0');
		return `${y}-${m}-${day}T${h}:${min}:${secPart}.${ms}`;
	}

	const fixedWindowSeconds = $derived(
		Math.max(60, $timeConductorState.fixedEnd - $timeConductorState.fixedStart)
	);
</script>

<div class="time-conductor">
	<div class="mode-row">
		<span class="label">Time</span>
		<div class="mode-toggle" role="group" aria-label="Time mode">
			<button
				type="button"
				class="mode-btn"
				class:active={$timeConductorState.mode === 'realtime'}
				onclick={() => {
					stopReplay();
					enterRealtime();
				}}
			>
				Realtime
			</button>
			<button
				type="button"
				class="mode-btn"
				class:active={$timeConductorState.mode === 'fixed'}
				onclick={enterHistory}
			>
				History
			</button>
		</div>
	</div>

	{#if $timeConductorState.mode === 'realtime'}
		<select
			class="range-select"
			aria-label="Realtime window"
			value={$timelineRange}
			onchange={(e) => enterRealtime((e.target as HTMLSelectElement).value as TimelineRangeId)}
		>
			<option value="1h">Last 1h</option>
			<option value="24h">Last 24h</option>
		</select>
	{:else}
		<div class="fixed-bounds">
			<div class="replay-controls" role="group" aria-label="Replay controls">
				<button
					type="button"
					class="replay-button"
					aria-label={$replayClock.playing ? 'Pause replay' : 'Play replay'}
					title={$replayClock.playing ? 'Pause replay' : 'Play replay'}
					onclick={toggleReplay}
				>
					{#if $replayClock.playing}<Pause size={13} />{:else}<Play size={13} />{/if}
				</button>
				<select
					class="speed-select"
					aria-label="Replay speed"
					value={replaySpeed}
					onchange={(event) => {
						replaySpeed = Number((event.currentTarget as HTMLSelectElement).value);
						setReplaySpeed(replaySpeed);
					}}
				>
					<option value={0.25}>0.25×</option>
					<option value={1}>1×</option>
					<option value={2}>2×</option>
					<option value={10}>10×</option>
				</select>
			</div>
			<label class="scrub-control">
				<span class="sr-only">Replay position</span>
				<input
					type="range"
					min={$replayClock.start}
					max={$replayClock.end}
					step="0.001"
					value={$replayClock.playhead}
					aria-label="Replay position"
					oninput={scrubReplay}
				/>
			</label>
			<span class="playhead-time" aria-live="off">{formatSec($replayClock.playhead)}</span>
			<div class="bounds-shift" role="group" aria-label="Shift fixed timeline window">
				<button
					type="button"
					class="preset-btn"
					onclick={() => shiftFixedWindow(-fixedWindowSeconds)}
				>
					Back
				</button>
				<button
					type="button"
					class="preset-btn"
					onclick={() => shiftFixedWindow(fixedWindowSeconds)}
				>
					Forward
				</button>
			</div>
			<div class="bounds-presets">
				<button type="button" class="preset-btn" onclick={setPresetToLast1h}>Last 1h</button>
				<button type="button" class="preset-btn" onclick={setPresetToLast24h}>Last 24h</button>
			</div>
			<div class="bounds-inputs">
				<label class="bound-label">
					Start
					<input
						type="datetime-local"
						class="bound-input"
						step="0.001"
						value={toDatetimeLocal($timeConductorState.fixedStart)}
						oninput={onFixedStartInput}
					/>
				</label>
				<label class="bound-label">
					End
					<input
						type="datetime-local"
						class="bound-input"
						step="0.001"
						value={toDatetimeLocal($timeConductorState.fixedEnd)}
						oninput={onFixedEndInput}
					/>
				</label>
			</div>
		</div>
	{/if}
</div>

<style>
	.time-conductor {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.35rem 0.65rem;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		min-height: 1.75rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.time-conductor::-webkit-scrollbar {
		display: none;
	}
	.label {
		font-weight: 500;
		color: var(--mcs-text);
	}
	.mode-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.mode-toggle {
		display: flex;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		overflow: hidden;
	}
	.mode-btn {
		padding: 0.2rem 0.5rem;
		background: var(--mcs-surface-alt);
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
		font-size: 0.75rem;
	}
	.mode-btn.active {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
	}
	.mode-btn:not(.active):hover {
		background: var(--mcs-surface);
		color: var(--mcs-text);
	}
	.range-select {
		padding: 0.2rem 0.35rem;
		font-size: 0.75rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.fixed-bounds {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.35rem;
	}
	.bounds-presets {
		display: flex;
		gap: 0.25rem;
	}
	.bounds-shift {
		display: flex;
		gap: 0.25rem;
	}
	.replay-controls {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.scrub-control {
		display: flex;
		align-items: center;
		min-width: 8rem;
		flex: 1 1 12rem;
	}
	.scrub-control input {
		width: 100%;
		accent-color: var(--mcs-accent);
	}
	.playhead-time {
		font-family: var(--mcs-font-mono);
		font-size: 0.65rem;
		white-space: nowrap;
		color: var(--mcs-text-muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.replay-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		background: var(--mcs-accent);
		border: 1px solid var(--mcs-accent);
		color: var(--mcs-bg);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.speed-select {
		padding: 0.2rem 0.3rem;
		font-size: 0.7rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
	}
	.preset-btn {
		padding: 0.28rem 0.48rem;
		font-size: 0.7rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.preset-btn:hover {
		background: var(--mcs-surface);
	}
	.bounds-inputs {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		white-space: nowrap;
	}
	.bound-label {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.bound-input {
		padding: 0.15rem 0.3rem;
		font-size: 0.7rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		min-width: 12.5rem;
	}
	@media (max-width: 1300px) {
		.time-conductor {
			flex: 1 1 100%;
			min-width: 0;
			overflow-x: visible;
		}
		.fixed-bounds {
			flex-wrap: wrap;
		}
	}
</style>
