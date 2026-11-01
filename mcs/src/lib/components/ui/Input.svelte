<script lang="ts">
	let {
		value = $bindable(''),
		type = 'text',
		placeholder,
		disabled = false,
		invalid = false,
		class: className = '',
		...rest
	}: {
		value?: string;
		type?: 'text' | 'search' | 'email' | 'number' | 'password' | 'url';
		placeholder?: string;
		disabled?: boolean;
		invalid?: boolean;
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<input
	class="mcs-input {className}"
	class:invalid
	bind:value
	{type}
	{placeholder}
	{disabled}
	{...rest}
/>

<style>
	.mcs-input {
		box-sizing: border-box;
		width: 100%;
		height: var(--mcs-control-height-md);
		padding: 0 var(--mcs-space-3);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: 400 0.82rem/1 var(--mcs-font-sans);
		transition:
			border-color var(--mcs-motion-fast),
			box-shadow var(--mcs-motion-fast),
			background var(--mcs-motion-fast);
	}
	.mcs-input::placeholder {
		color: var(--mcs-text-muted);
		opacity: 0.7;
	}
	.mcs-input:hover:not(:disabled) {
		border-color: var(--mcs-text-muted);
	}
	.mcs-input:focus {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
		border-color: var(--mcs-accent);
	}
	.mcs-input:disabled {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text-muted);
		cursor: not-allowed;
	}
	.mcs-input.invalid {
		border-color: var(--mcs-danger);
	}
</style>
