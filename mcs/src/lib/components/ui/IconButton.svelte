<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		label,
		size = 'md',
		disabled = false,
		class: className = '',
		...rest
	}: {
		children?: Snippet;
		label: string;
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<button
	class="mcs-icon-button mcs-icon-button-{size} {className}"
	type="button"
	{disabled}
	aria-label={label}
	{...rest}
>
	{@render children?.()}
</button>

<style>
	.mcs-icon-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: var(--mcs-radius);
		background: transparent;
		color: var(--mcs-text-muted);
		cursor: pointer;
		transition:
			background var(--mcs-motion-fast),
			color var(--mcs-motion-fast);
	}
	.mcs-icon-button:hover:not(:disabled) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.mcs-icon-button:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.mcs-icon-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.mcs-icon-button-sm {
		width: 2rem;
		height: 2rem;
	}
	.mcs-icon-button-md {
		width: 2.25rem;
		height: 2.25rem;
	}
	.mcs-icon-button-lg {
		width: 2.75rem;
		height: 2.75rem;
	}
</style>
