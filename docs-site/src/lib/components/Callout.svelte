<script lang="ts">
	interface Props {
		type?: 'tip' | 'warning' | 'info' | 'danger';
		title?: string;
		children?: import('svelte').Snippet;
	}

	let { type = 'info', title, children }: Props = $props();
</script>

<div class="callout callout-{type}">
	{#if title}<div class="callout-header">{title}</div>{/if}
	<div class="callout-body">
		{@render children?.()}
	</div>
</div>

<style>
	.callout {
		padding: 0.95rem 1rem;
		border: 1px solid var(--docs-border);
		border-left-width: 2px;
		background: color-mix(in srgb, var(--docs-surface-strong) 84%, transparent);
	}

	.callout-tip {
		border-color: var(--docs-accent);
	}

	.callout-warning {
		border-color: var(--docs-warning);
	}

	.callout-info {
		border-color: var(--docs-accent);
	}

	.callout-danger {
		border-color: var(--docs-danger);
	}

	.callout-header {
		margin-bottom: 0.35rem;
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--docs-text);
	}

	.callout-body {
		font-size: 0.94rem;
		color: var(--docs-text-soft);
		line-height: 1.7;
	}
</style>
