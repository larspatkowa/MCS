<script lang="ts">
	import { X, Plus } from '@lucide/svelte';

	type Option = { value: string; label: string };
	let {
		values = [],
		options,
		onChange
	}: {
		values?: string[];
		options: Option[];
		onChange?: (v: string[]) => void;
	} = $props();

	// Stream dropdown: only show streams not already added
	const available = $derived(options.filter((o) => o.value !== '' && !values.includes(o.value)));

	function addStream(id: string) {
		if (!id || values.includes(id)) return;
		onChange?.([...values, id]);
	}

	function removeStream(id: string) {
		onChange?.(values.filter((v) => v !== id));
	}

	function getLabel(id: string): string {
		return options.find((o) => o.value === id)?.label ?? id;
	}
</script>

<div class="multi-stream">
	{#if values.length > 0}
		<ul class="stream-tags">
			{#each values as id (id)}
				<li class="stream-tag">
					<span class="stream-tag-label">{getLabel(id)}</span>
					<button
						type="button"
						class="stream-tag-remove"
						aria-label="Remove {getLabel(id)}"
						onclick={() => removeStream(id)}
					>
						<X size={11} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if available.length > 0}
		<div class="stream-add-row">
			<select
				class="stream-add-select"
				value=""
				onchange={(e) => {
					const sel = e.target as HTMLSelectElement;
					addStream(sel.value);
					sel.value = '';
				}}
			>
				<option value="" disabled>Add stream…</option>
				{#each available as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<Plus size={14} class="stream-add-icon" />
		</div>
	{:else if values.length === 0}
		<p class="stream-empty">No streams available.</p>
	{/if}
</div>

<style>
	.multi-stream {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.stream-tags {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.stream-tag {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--mcs-surface-raised, var(--mcs-surface));
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		color: var(--mcs-text);
	}

	.stream-tag-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stream-tag-remove {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--mcs-text-muted);
		padding: 0;
		display: flex;
		align-items: center;
		margin-left: 0.4rem;
		border-radius: 2px;
	}
	.stream-tag-remove:hover {
		color: var(--mcs-danger, #ef4444);
	}

	.stream-add-row {
		position: relative;
		display: flex;
		align-items: center;
	}

	.stream-add-select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.3rem 0.5rem;
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
	.stream-add-select:focus {
		outline: none;
		border-color: var(--mcs-accent);
		color: var(--mcs-text);
	}

	.stream-add-row :global(.stream-add-icon) {
		position: absolute;
		left: 0.35rem;
		pointer-events: none;
		color: var(--mcs-text-muted);
	}

	.stream-empty {
		font-size: 0.78rem;
		color: var(--mcs-text-muted);
		margin: 0;
		font-style: italic;
	}
</style>
