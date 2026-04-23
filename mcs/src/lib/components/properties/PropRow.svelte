<script lang="ts">
	import { propertyFilterText, propertyPanelMode } from '$lib/stores/property-panel';
	import type { Snippet } from 'svelte';
	let {
		label,
		hint,
		tooltip,
		advanced = false,
		children
	}: {
		label: string;
		hint?: string;
		tooltip?: string;
		advanced?: boolean;
		children?: Snippet;
	} = $props();

	const visible = $derived.by(() => {
		if (advanced && $propertyPanelMode === 'essentials') return false;
		const query = $propertyFilterText.trim().toLowerCase();
		if (!query) return true;
		return label.toLowerCase().includes(query) || (hint ?? '').toLowerCase().includes(query);
	});
</script>

{#if visible}
	<div class="prop-row">
		<label class="prop-row-label">
			<span class="prop-row-label-line">
				<span class="prop-row-label-text">{label}</span>
				{#if tooltip}
					<span class="prop-row-tooltip" title={tooltip} aria-label={tooltip}>?</span>
				{/if}
			</span>
			{#if hint}
				<span class="prop-row-hint">{hint}</span>
			{/if}
			<span class="prop-row-control">
				{@render children?.()}
			</span>
		</label>
	</div>
{/if}

<style>
	.prop-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.prop-row-label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
	}
	.prop-row-label-line {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.prop-row-label-text {
		font-weight: 500;
		color: var(--mcs-text);
	}
	.prop-row-tooltip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: auto;
		height: auto;
		padding: 0;
		border: none;
		background: none;
		color: var(--mcs-text-muted);
		font-size: 0.68rem;
		font-weight: 700;
		cursor: default;
		line-height: 1;
		opacity: 0.75;
	}
	.prop-row-tooltip:hover {
		color: var(--mcs-text);
		opacity: 1;
	}
	.prop-row-hint {
		font-size: 0.7rem;
		color: var(--mcs-text-muted);
	}
	.prop-row-control {
		display: block;
	}
	.prop-row-control :global(input),
	.prop-row-control :global(select),
	.prop-row-control :global(textarea) {
		width: 100%;
		box-sizing: border-box;
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		font-family: inherit;
	}
	.prop-row-control :global(input:focus),
	.prop-row-control :global(select:focus),
	.prop-row-control :global(textarea:focus) {
		outline: none;
		border-color: var(--mcs-accent);
	}
	.prop-row-control :global(input[type='checkbox']) {
		width: auto;
		margin-right: 0.5rem;
	}
</style>
