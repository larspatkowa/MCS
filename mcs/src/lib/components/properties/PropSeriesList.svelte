<script lang="ts">
	import { X, Plus, ChevronDown, ChevronUp } from '@lucide/svelte';

	export interface SeriesItem {
		dataSource: string;
		name?: string;
		color?: string;
		interpolation?: 'linear' | 'step' | 'smooth' | 'basis';
		/** overlay-plot only */
		axis?: 'left' | 'right';
		/** overlay-plot only */
		type?: 'line' | 'scatter';
	}

	type Option = { value: string; label: string };

	const COLORS = [
		'#4f9cf9',
		'#f97316',
		'#10b981',
		'#f59e0b',
		'#8b5cf6',
		'#ec4899',
		'#14b8a6',
		'#ef4444'
	];
	const INTERP_OPTIONS = [
		{ value: 'linear', label: 'Linear' },
		{ value: 'step', label: 'Step' },
		{ value: 'smooth', label: 'Smooth' }
	];

	let {
		series = [],
		streamOptions,
		showAxis = false,
		showType = false,
		onChange
	}: {
		series?: SeriesItem[];
		streamOptions: Option[];
		showAxis?: boolean;
		showType?: boolean;
		onChange?: (v: SeriesItem[]) => void;
	} = $props();

	let expandedIndex = $state<number | null>(null);

	// Pick the next unused color
	function nextColor(existing: SeriesItem[]): string {
		for (const c of COLORS) {
			if (!existing.some((s) => s.color === c)) return c;
		}
		return COLORS[existing.length % COLORS.length];
	}

	const availableStreams = $derived(streamOptions.filter((o) => o.value !== ''));

	function addSeries(streamId: string) {
		if (!streamId) return;
		const updated: SeriesItem[] = [
			...series,
			{
				dataSource: streamId,
				name: streamOptions.find((o) => o.value === streamId)?.label ?? streamId,
				color: nextColor(series),
				interpolation: 'linear',
				...(showAxis ? { axis: 'left' as const } : {}),
				...(showType ? { type: 'line' as const } : {})
			}
		];
		onChange?.(updated);
		expandedIndex = updated.length - 1;
	}

	function removeSeries(i: number) {
		const updated = series.filter((_, idx) => idx !== i);
		onChange?.(updated);
		if (expandedIndex === i) expandedIndex = null;
	}

	function updateSeries(i: number, patch: Partial<SeriesItem>) {
		const updated = series.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
		onChange?.(updated);
	}

	function getStreamLabel(id: string): string {
		return streamOptions.find((o) => o.value === id)?.label ?? id;
	}

	const unusedStreams = $derived(
		availableStreams.filter((o) => !series.some((s) => s.dataSource === o.value))
	);
</script>

<div class="series-list">
	{#each series as s, i (i)}
		<div class="series-card">
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				class="series-card-header"
				role="button"
				aria-expanded={expandedIndex === i}
				onclick={() => (expandedIndex = expandedIndex === i ? null : i)}
				onkeydown={(e) => e.key === 'Enter' && (expandedIndex = expandedIndex === i ? null : i)}
			>
				<span class="series-swatch" style:background={s.color ?? '#999'}></span>
				<span class="series-name">{s.name ?? getStreamLabel(s.dataSource)}</span>
				<span class="series-actions">
					{#if expandedIndex === i}<ChevronUp size={13} />{:else}<ChevronDown size={13} />{/if}
					<button
						type="button"
						class="series-remove"
						aria-label="Remove series"
						onclick={(e) => {
							e.stopPropagation();
							removeSeries(i);
						}}
					>
						<X size={12} />
					</button>
				</span>
			</div>

			{#if expandedIndex === i}
				<div class="series-card-body">
					<div class="series-field">
						<label class="series-field-label" for="series-stream-{i}">Stream</label>
						<select
							id="series-stream-{i}"
							class="series-select"
							value={s.dataSource}
							onchange={(e) =>
								updateSeries(i, { dataSource: (e.target as HTMLSelectElement).value })}
						>
							{#each streamOptions.filter((o) => o.value !== '') as opt}
								<option value={opt.value} selected={opt.value === s.dataSource}>{opt.label}</option>
							{/each}
						</select>
					</div>

					<div class="series-field">
						<label class="series-field-label" for="series-name-{i}">Name</label>
						<input
							id="series-name-{i}"
							class="series-input"
							type="text"
							value={s.name ?? ''}
							oninput={(e) => updateSeries(i, { name: (e.target as HTMLInputElement).value })}
						/>
					</div>

					<div class="series-field series-field-row">
						<div class="series-field flex-1">
							<label class="series-field-label" for="series-color-{i}">Color</label>
							<input
								id="series-color-{i}"
								class="series-color"
								type="color"
								value={s.color ?? '#4f9cf9'}
								oninput={(e) => updateSeries(i, { color: (e.target as HTMLInputElement).value })}
							/>
						</div>

						<div class="series-field flex-1">
							<label class="series-field-label" for="series-interp-{i}">Interpolation</label>
							<select
								id="series-interp-{i}"
								class="series-select"
								value={s.interpolation ?? 'linear'}
								onchange={(e) =>
									updateSeries(i, {
										interpolation: (e.target as HTMLSelectElement)
											.value as SeriesItem['interpolation']
									})}
							>
								{#each INTERP_OPTIONS as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if showAxis}
						<div class="series-field">
							<label class="series-field-label" for="series-axis-{i}">Y Axis</label>
							<select
								id="series-axis-{i}"
								class="series-select"
								value={s.axis ?? 'left'}
								onchange={(e) =>
									updateSeries(i, {
										axis: (e.target as HTMLSelectElement).value as 'left' | 'right'
									})}
							>
								<option value="left">Left</option>
								<option value="right">Right</option>
							</select>
						</div>
					{/if}

					{#if showType}
						<div class="series-field">
							<label class="series-field-label" for="series-type-{i}">Type</label>
							<select
								id="series-type-{i}"
								class="series-select"
								value={s.type ?? 'line'}
								onchange={(e) =>
									updateSeries(i, {
										type: (e.target as HTMLSelectElement).value as 'line' | 'scatter'
									})}
							>
								<option value="line">Line</option>
								<option value="scatter">Scatter</option>
							</select>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}

	{#if unusedStreams.length > 0}
		<div class="series-add-row">
			<select
				class="series-add-select"
				value=""
				onchange={(e) => {
					const sel = e.target as HTMLSelectElement;
					addSeries(sel.value);
					sel.value = '';
				}}
			>
				<option value="" disabled>Add series…</option>
				{#each unusedStreams as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<Plus size={14} class="series-add-icon" />
		</div>
	{:else if series.length === 0}
		<p class="series-empty">No series. Select a stream to add one.</p>
		<div class="series-add-row">
			<select
				class="series-add-select"
				value=""
				onchange={(e) => {
					const sel = e.target as HTMLSelectElement;
					addSeries(sel.value);
					sel.value = '';
				}}
			>
				<option value="" disabled>Add series…</option>
				{#each availableStreams as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<Plus size={14} class="series-add-icon" />
		</div>
	{/if}
</div>

<style>
	.series-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.series-card {
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		overflow: hidden;
	}

	.series-card-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		background: var(--mcs-surface-raised, var(--mcs-surface));
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		font-size: 0.8rem;
		color: var(--mcs-text);
		box-sizing: border-box;
		user-select: none;
	}
	.series-card-header:hover {
		background: var(--mcs-surface-hover, color-mix(in srgb, var(--mcs-surface) 90%, white));
	}

	.series-swatch {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.series-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.series-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--mcs-text-muted);
	}

	.series-remove {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--mcs-text-muted);
		display: flex;
		align-items: center;
		padding: 1px;
		border-radius: 2px;
	}
	.series-remove:hover {
		color: var(--mcs-danger, #ef4444);
	}

	.series-card-body {
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		border-top: 1px solid var(--mcs-border);
		background: var(--mcs-bg, var(--mcs-surface));
	}

	.series-field {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.series-field-row {
		flex-direction: row;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.flex-1 {
		flex: 1;
	}

	.series-field-label {
		font-size: 0.73rem;
		color: var(--mcs-text-muted);
		font-weight: 500;
	}

	.series-select,
	.series-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.28rem 0.45rem;
		font-size: 0.8rem;
		font-family: inherit;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		appearance: none;
	}
	.series-select:focus,
	.series-input:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}

	.series-color {
		width: 32px;
		height: 28px;
		padding: 2px;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		cursor: pointer;
	}

	.series-add-row {
		position: relative;
		display: flex;
		align-items: center;
	}

	.series-add-select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.28rem 0.45rem;
		padding-left: 1.4rem;
		font-size: 0.8rem;
		background: var(--mcs-surface);
		border: 1px dashed var(--mcs-border);
		color: var(--mcs-text-muted);
		border-radius: var(--mcs-radius);
		font-family: inherit;
		cursor: pointer;
		appearance: none;
	}
	.series-add-select:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}

	.series-add-row :global(.series-add-icon) {
		position: absolute;
		left: 0.35rem;
		pointer-events: none;
		color: var(--mcs-text-muted);
	}

	.series-empty {
		font-size: 0.78rem;
		color: var(--mcs-text-muted);
		margin: 0 0 0.25rem;
		font-style: italic;
	}
</style>
