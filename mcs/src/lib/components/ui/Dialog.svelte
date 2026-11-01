<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		description,
		id = 'mcs-dialog',
		onClose,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		id?: string;
		onClose?: () => void;
		children?: Snippet;
		footer?: Snippet;
	} = $props();

	function close() {
		open = false;
		onClose?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="mcs-dialog-overlay"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && close()}
	>
		<dialog
			open
			class="mcs-dialog"
			aria-labelledby="{id}-title"
			aria-describedby={description ? `${id}-description` : undefined}
		>
			<header class="mcs-dialog-header">
				<div>
					<h2 id="{id}-title">{title}</h2>
					{#if description}<p id="{id}-description">{description}</p>{/if}
				</div>
				<button class="mcs-dialog-close" type="button" aria-label="Close dialog" onclick={close}
					>×</button
				>
			</header>
			<div class="mcs-dialog-body">{@render children?.()}</div>
			{#if footer}<footer class="mcs-dialog-footer">{@render footer()}</footer>{/if}
		</dialog>
	</div>
{/if}

<style>
	.mcs-dialog-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--mcs-z-modal);
		display: grid;
		place-items: center;
		padding: var(--mcs-space-5);
		background: color-mix(in srgb, #000 32%, transparent);
		animation: mcs-fade-in var(--mcs-motion-standard);
	}
	.mcs-dialog {
		width: min(34rem, 100%);
		max-height: min(90vh, 40rem);
		overflow: auto;
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		background: var(--mcs-surface);
		color: var(--mcs-text);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		animation: mcs-dialog-in var(--mcs-motion-standard);
	}
	.mcs-dialog-header,
	.mcs-dialog-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--mcs-space-4);
		padding: var(--mcs-space-4) var(--mcs-space-5);
		border-bottom: 1px solid var(--mcs-border);
	}
	.mcs-dialog-header h2 {
		margin: 0;
		font: 600 0.95rem/1.2 var(--mcs-font-mono);
	}
	.mcs-dialog-header p {
		margin: 0.35rem 0 0;
		color: var(--mcs-text-muted);
		font-size: 0.75rem;
	}
	.mcs-dialog-close {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--mcs-text-muted);
		font-size: 1.25rem;
		cursor: pointer;
	}
	.mcs-dialog-close:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.mcs-dialog-close:focus-visible {
		outline: none;
		box-shadow: var(--mcs-focus-ring);
	}
	.mcs-dialog-body {
		padding: var(--mcs-space-5);
	}
	.mcs-dialog-footer {
		justify-content: flex-end;
		border-top: 1px solid var(--mcs-border);
		border-bottom: 0;
	}
	@keyframes mcs-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@keyframes mcs-dialog-in {
		from {
			opacity: 0;
			transform: translateY(0.25rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
