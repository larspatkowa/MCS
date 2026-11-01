<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		description,
		error,
		required = false,
		children
	}: {
		label: string;
		description?: string;
		error?: string;
		required?: boolean;
		children?: Snippet;
	} = $props();
</script>

<div class="mcs-field" class:has-error={Boolean(error)}>
	<div class="mcs-field-heading">
		<span class="mcs-field-label"
			>{label}{#if required}<span aria-hidden="true"> *</span>{/if}</span
		>
		{#if description}<span class="mcs-field-description">{description}</span>{/if}
	</div>
	{@render children?.()}
	{#if error}<span class="mcs-field-error" role="alert">{error}</span>{/if}
</div>

<style>
	.mcs-field {
		display: flex;
		flex-direction: column;
		gap: var(--mcs-space-2);
	}
	.mcs-field-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--mcs-space-3);
	}
	.mcs-field-label {
		color: var(--mcs-text-muted);
		font: 400 0.78rem/1.2 var(--mcs-font-mono);
	}
	.mcs-field-description {
		color: var(--mcs-text-muted);
		font-size: 0.7rem;
	}
	.mcs-field-error {
		color: var(--mcs-danger);
		font-size: 0.72rem;
	}
	.has-error :global(.mcs-input),
	.has-error :global(.mcs-textarea),
	.has-error :global(.mcs-select) {
		border-color: var(--mcs-danger);
	}
</style>
