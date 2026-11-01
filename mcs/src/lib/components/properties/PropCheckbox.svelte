<script lang="ts">
	let {
		checked = false,
		label = '',
		disabled = false,
		onChange
	}: {
		checked?: boolean;
		label?: string;
		disabled?: boolean;
		onChange?: (v: boolean) => void;
	} = $props();
</script>

<label class="prop-checkbox">
	<input
		type="checkbox"
		class="prop-checkbox-input"
		{checked}
		{disabled}
		onchange={(e) => onChange?.((e.target as HTMLInputElement).checked)}
	/>
	{#if label}
		<span class="prop-checkbox-label">{label}</span>
	{/if}
</label>

<style>
	.prop-checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--mcs-text);
		cursor: pointer;
	}
	.prop-checkbox-input {
		width: auto;
		margin: 0;
		accent-color: var(--mcs-accent);
	}
	.prop-checkbox-label {
		flex: 1;
	}
	.prop-checkbox:has(input:disabled) {
		cursor: default;
		opacity: 0.7;
	}
</style>
