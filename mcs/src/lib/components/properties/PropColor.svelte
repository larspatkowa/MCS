<script lang="ts">
	let {
		value = '',
		onChange
	}: {
		value?: string;
		onChange?: (v: string) => void;
	} = $props();

	/** Use type="color" only when value looks like #xxx or #xxxxxx; otherwise use text for CSS vars etc. */
	const isHex = $derived(/^#[0-9a-fA-F]{3,8}$/.test((value ?? '').trim()));
</script>

<div class="prop-color">
	{#if isHex}
		<input
			type="color"
			class="prop-color-swatch"
			value={value || '#000000'}
			oninput={(e) => onChange?.((e.target as HTMLInputElement).value)}
		/>
	{/if}
	<input
		type="text"
		class="prop-color-text"
		value={value ?? ''}
		placeholder="e.g. var(--mcs-accent) or #333"
		oninput={(e) => onChange?.((e.target as HTMLInputElement).value)}
	/>
</div>

<style>
	.prop-color {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.prop-color-swatch {
		width: 2rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		cursor: pointer;
		flex-shrink: 0;
	}
	.prop-color-text {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		font-family: inherit;
	}
	.prop-color-text:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
</style>
