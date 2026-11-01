<script lang="ts">
	let {
		value = $bindable(''),
		placeholder,
		rows = 4,
		disabled = false,
		class: className = '',
		...rest
	}: {
		value?: string;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<textarea class="mcs-textarea {className}" bind:value {placeholder} {rows} {disabled} {...rest}
></textarea>

<style>
	.mcs-textarea {
		box-sizing: border-box;
		width: 100%;
		min-height: 5.5rem;
		padding: var(--mcs-space-2) var(--mcs-space-3);
		resize: vertical;
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: 400 0.82rem/1.45 var(--mcs-font-sans);
		transition:
			border-color var(--mcs-motion-fast),
			box-shadow var(--mcs-motion-fast);
	}
	.mcs-textarea::placeholder {
		color: var(--mcs-text-muted);
		opacity: 0.7;
	}
	.mcs-textarea:hover:not(:disabled) {
		border-color: var(--mcs-text-muted);
	}
	.mcs-textarea:focus {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
		border-color: var(--mcs-accent);
	}
	.mcs-textarea:disabled {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text-muted);
		cursor: not-allowed;
	}
</style>
