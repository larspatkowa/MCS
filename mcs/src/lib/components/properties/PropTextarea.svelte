<script lang="ts">
	let {
		value = '',
		rows = 2,
		placeholder,
		onChange
	}: {
		value?: string;
		rows?: number;
		placeholder?: string;
		onChange?: (v: string) => void;
	} = $props();
</script>

<textarea
	class="prop-textarea"
	{value}
	{rows}
	{placeholder}
	oninput={(e) => onChange?.((e.target as HTMLTextAreaElement).value)}
></textarea>

<style>
	.prop-textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		font-family: inherit;
		resize: vertical;
		min-height: 2.5rem;
	}
	.prop-textarea:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
</style>
