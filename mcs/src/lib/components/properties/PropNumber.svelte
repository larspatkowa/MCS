<script lang="ts">
	let {
		value,
		min,
		max,
		step,
		placeholder,
		onChange
	}: {
		value: number | undefined;
		min?: number;
		max?: number;
		step?: number | 'any';
		placeholder?: string;
		onChange?: (v: number | undefined) => void;
	} = $props();
</script>

<input
	type="number"
	class="prop-input-number"
	value={value ?? ''}
	{min}
	{max}
	step={step === 'any' ? 'any' : step}
	{placeholder}
	oninput={(e) => {
		const v = (e.target as HTMLInputElement).value;
		if (v === '' || v === undefined) {
			onChange?.(undefined);
		} else {
			const n = Number(v);
			if (!Number.isNaN(n)) onChange?.(n);
		}
	}}
/>

<style>
	.prop-input-number {
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
	.prop-input-number:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
</style>
