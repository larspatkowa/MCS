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
		border-radius: var(--docs-radius);
		background: var(--docs-surface-strong);
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
