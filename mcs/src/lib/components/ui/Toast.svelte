<script lang="ts">
	type ToastTone = 'info' | 'success' | 'warning' | 'danger';
	let {
		open = $bindable(true),
		title,
		message,
		tone = 'info',
		onDismiss
	}: {
		open?: boolean;
		title: string;
		message?: string;
		tone?: ToastTone;
		onDismiss?: () => void;
	} = $props();

	function dismiss() {
		open = false;
		onDismiss?.();
	}
</script>

{#if open}
	<div class="mcs-toast mcs-toast-{tone}" role="status" aria-live="polite">
		<div class="mcs-toast-copy">
			<strong>{title}</strong>{#if message}<span>{message}</span>{/if}
		</div>
		<button
			class="mcs-toast-close"
			type="button"
			aria-label="Dismiss notification"
			onclick={dismiss}>×</button
		>
	</div>
{/if}

<style>
	.mcs-toast {
		display: flex;
		align-items: flex-start;
		gap: var(--mcs-space-3);
		width: min(22rem, 100%);
		padding: var(--mcs-space-3);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		background: var(--mcs-surface);
		color: var(--mcs-text);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16);
		animation: mcs-toast-in var(--mcs-motion-standard);
	}
	.mcs-toast-info {
		--mcs-toast-color: var(--mcs-text);
	}
	.mcs-toast-success {
		--mcs-toast-color: var(--mcs-success);
	}
	.mcs-toast-warning {
		--mcs-toast-color: var(--mcs-warning);
	}
	.mcs-toast-danger {
		--mcs-toast-color: var(--mcs-danger);
	}
	.mcs-toast-copy {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
		color: var(--mcs-text);
	}
	.mcs-toast-copy strong {
		color: var(--mcs-toast-color);
		font: 600 0.78rem/1.2 var(--mcs-font-mono);
	}
	.mcs-toast-copy span {
		color: var(--mcs-text-muted);
		font-size: 0.72rem;
		line-height: 1.35;
	}
	.mcs-toast-close {
		margin-left: auto;
		padding: 0 0.2rem;
		border: 0;
		background: transparent;
		color: var(--mcs-text-muted);
		font-size: 1rem;
		cursor: pointer;
	}
	.mcs-toast-close:hover {
		color: var(--mcs-text);
	}
	.mcs-toast-close:focus-visible {
		outline: none;
		box-shadow: var(--mcs-focus-ring);
	}
	@keyframes mcs-toast-in {
		from {
			opacity: 0;
			transform: translateY(0.4rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
