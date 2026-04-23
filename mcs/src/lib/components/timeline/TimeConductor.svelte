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
	import { formatDateTime } from '$lib/date-time-format';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { currentProject } from '$lib/stores/project';

	const effectiveOptions = $derived(
		getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime)
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

	function onFixedStartInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		const sec = new Date(v).getTime() / 1000;
		if (!Number.isNaN(sec)) {
			timeConductorState.update((s) => ({ ...s, fixedStart: sec }));
		}
	}

	function onFixedEndInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		const sec = new Date(v).getTime() / 1000;
		if (!Number.isNaN(sec)) {
			timeConductorState.update((s) => ({ ...s, fixedEnd: sec }));
		}
	}

	function toDatetimeLocal(sec: number): string {
		const d = new Date(sec * 1000);
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const h = String(d.getHours()).padStart(2, '0');
		const min = String(d.getMinutes()).padStart(2, '0');
		return `${y}-${m}-${day}T${h}:${min}`;
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
				onclick={() => timeConductorState.update((s) => ({ ...s, mode: 'realtime' }))}
			>
				Realtime
			</button>
			<button
				type="button"
				class="mode-btn"
				class:active={$timeConductorState.mode === 'fixed'}
				onclick={() => timeConductorState.update((s) => ({ ...s, mode: 'fixed' }))}
			>
				Fixed
			</button>
		</div>
	</div>

	{#if $timeConductorState.mode === 'realtime'}
		<select
			class="range-select"
			aria-label="Realtime window"
			value={$timelineRange}
			onchange={(e) =>
				setRealtimeWithPreset((e.target as HTMLSelectElement).value as TimelineRangeId)}
		>
			<option value="1h">Last 1h</option>
			<option value="24h">Last 24h</option>
		</select>
	{:else}
		<div class="fixed-bounds">
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
						value={toDatetimeLocal($timeConductorState.fixedStart)}
						oninput={onFixedStartInput}
					/>
				</label>
				<label class="bound-label">
					End
					<input
						type="datetime-local"
						class="bound-input"
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
	}
</style>
