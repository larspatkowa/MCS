<script lang="ts">
	export type SelectOption = { value: string; label: string; disabled?: boolean };

	let {
		value = $bindable(''),
		options,
		placeholder,
		disabled = false,
		class: className = '',
		...rest
	}: {
		value?: string;
		options: SelectOption[];
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<select class="mcs-select {className}" bind:value {disabled} {...rest}>
	{#if placeholder}<option value="" disabled>{placeholder}</option>{/if}
	{#each options as option}
		<option value={option.value} disabled={option.disabled}>{option.label}</option>
	{/each}
</select>

<style>
	.mcs-select {
		box-sizing: border-box;
		width: 100%;
		height: var(--mcs-control-height-md);
		padding: 0 2rem 0 var(--mcs-space-3);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: 400 0.82rem/1 var(--mcs-font-sans);
		cursor: pointer;
		transition:
			border-color var(--mcs-motion-fast),
			box-shadow var(--mcs-motion-fast);
	}
	.mcs-select:hover:not(:disabled) {
		border-color: var(--mcs-text-muted);
	}
	.mcs-select:focus {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
		border-color: var(--mcs-accent);
	}
	.mcs-select:disabled {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text-muted);
		cursor: not-allowed;
	}
</style>
