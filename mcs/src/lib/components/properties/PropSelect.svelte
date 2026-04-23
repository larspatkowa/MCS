<script lang="ts">
	type Option = { value: string; label: string };
	let {
		value = '',
		options,
		onChange
	}: {
		value?: string;
		options: Option[];
		onChange?: (v: string) => void;
	} = $props();
</script>

<select
	class="prop-select"
	{value}
	onchange={(e) => onChange?.((e.target as HTMLSelectElement).value)}
>
	{#each options as opt}
		<option value={opt.value}>{opt.label}</option>
	{/each}
</select>

<style>
	.prop-select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		font-family: inherit;
		cursor: pointer;
	}
	.prop-select:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
</style>
