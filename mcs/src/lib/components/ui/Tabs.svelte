<script lang="ts">
	export type TabItem = { value: string; label: string; disabled?: boolean };

	let {
		value = $bindable(''),
		items,
		label = 'Tabs'
	}: { value?: string; items: TabItem[]; label?: string } = $props();
	$effect(() => {
		if (!value && items.length) value = items[0].value;
	});
</script>

<div class="mcs-tabs">
	<div class="mcs-tab-list" role="tablist" aria-label={label}>
		{#each items as item}
			<button
				type="button"
				role="tab"
				class="mcs-tab"
				class:active={value === item.value}
				aria-selected={value === item.value}
				disabled={item.disabled}
				onclick={() => (value = item.value)}
			>
				{item.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.mcs-tabs {
		min-width: 0;
	}
	.mcs-tab-list {
		display: flex;
		gap: 0.2rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	.mcs-tab {
		position: relative;
		padding: 0.6rem 0.75rem;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--mcs-text-muted);
		font: 600 0.72rem/1 var(--mcs-font-mono);
		cursor: pointer;
		transition:
			color var(--mcs-motion-fast),
			border-color var(--mcs-motion-fast);
	}
	.mcs-tab:hover:not(:disabled) {
		color: var(--mcs-text);
	}
	.mcs-tab.active {
		border-bottom-color: var(--mcs-accent);
		color: var(--mcs-text);
	}
	.mcs-tab:focus-visible {
		outline: none;
		box-shadow: var(--mcs-focus-ring);
	}
	.mcs-tab:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
