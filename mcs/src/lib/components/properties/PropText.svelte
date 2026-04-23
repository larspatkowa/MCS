<script lang="ts">
	let {
		value = '',
		placeholder,
		onChange
	}: {
		value?: string;
		placeholder?: string;
		onChange?: (v: string) => void;
	} = $props();
</script>

<input
	type="text"
	class="prop-input-text"
	{value}
	{placeholder}
	oninput={(e) => onChange?.((e.target as HTMLInputElement).value)}
/>

<style>
	.prop-input-text {
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
	.prop-input-text:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
</style>
