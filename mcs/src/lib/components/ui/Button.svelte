<script lang="ts">
	import type { Snippet } from 'svelte';

	type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
	type ButtonSize = 'sm' | 'md' | 'lg';

	let {
		children,
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		loading = false,
		fullWidth = false,
		class: className = '',
		...rest
	}: {
		children?: Snippet;
		variant?: ButtonVariant;
		size?: ButtonSize;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		loading?: boolean;
		fullWidth?: boolean;
		class?: string;
		[key: string]: unknown;
	} = $props();
</script>

<button
	class="mcs-button mcs-button-{variant} mcs-button-{size} {className}"
	class:full-width={fullWidth}
	{type}
	disabled={disabled || loading}
	aria-busy={loading ? 'true' : undefined}
	{...rest}
>
	<span class="mcs-button-content">
		{#if loading}<span class="mcs-spinner" aria-hidden="true"></span>{/if}
		{@render children?.()}
	</span>
</button>

<style>
	.mcs-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--mcs-space-2);
		border: 1px solid transparent;
		border-radius: 0;
		font: 500 0.8rem/1 var(--mcs-font-sans);
		letter-spacing: 0.01em;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background var(--mcs-motion-fast),
			border-color var(--mcs-motion-fast),
			color var(--mcs-motion-fast),
			opacity var(--mcs-motion-fast);
	}
	.mcs-button:focus-visible {
		outline: none;
		box-shadow: var(--mcs-focus-ring);
	}
	.mcs-button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.mcs-button-sm {
		min-height: var(--mcs-control-height-sm);
		padding: 0 var(--mcs-space-2);
	}
	.mcs-button-md {
		min-height: var(--mcs-control-height-md);
		padding: 0 var(--mcs-space-3);
	}
	.mcs-button-lg {
		min-height: var(--mcs-control-height-lg);
		padding: 0 var(--mcs-space-4);
		font-size: 0.86rem;
	}
	.mcs-button.full-width {
		width: 100%;
	}
	.mcs-button-primary {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
	}
	.mcs-button-primary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--mcs-accent) 88%, var(--mcs-text));
	}
	.mcs-button-secondary {
		background: var(--mcs-surface-alt);
		border-color: var(--mcs-border);
		color: var(--mcs-text);
	}
	.mcs-button-secondary:hover:not(:disabled),
	.mcs-button-outline:hover:not(:disabled) {
		background: var(--mcs-surface);
		border-color: var(--mcs-text-muted);
	}
	.mcs-button-outline {
		background: transparent;
		border-color: var(--mcs-border);
		color: var(--mcs-text);
	}
	.mcs-button-ghost {
		background: transparent;
		color: var(--mcs-text-muted);
	}
	.mcs-button-ghost:hover:not(:disabled) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.mcs-button-danger {
		background: transparent;
		border-color: var(--mcs-danger);
		color: var(--mcs-danger);
	}
	.mcs-button-danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--mcs-danger) 10%, var(--mcs-surface));
	}
	.mcs-button-content {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: inherit;
	}
	.mcs-spinner {
		width: 0.75rem;
		height: 0.75rem;
		border: 1.5px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: mcs-spin 650ms linear infinite;
	}
	@keyframes mcs-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
