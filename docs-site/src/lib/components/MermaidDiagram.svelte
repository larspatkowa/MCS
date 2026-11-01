<script lang="ts">
	interface Props {
		diagram: string;
		caption?: string;
	}

	let { diagram, caption }: Props = $props();
</script>

<figure class="mermaid-figure">
	<div class="mermaid-wrapper">
		<pre class="mermaid">{diagram.trim()}</pre>
	</div>
	{#if caption}
		<figcaption>{caption}</figcaption>
	{/if}
</figure>

<style>
	.mermaid-figure {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mermaid-wrapper {
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: color-mix(in srgb, var(--docs-surface-strong) 78%, transparent);
		padding: 1rem;
		overflow-x: auto;
	}

	.mermaid {
		font-family: var(--docs-font-mono);
		font-size: 0.8rem;
		color: var(--docs-text-soft);
		text-align: left;
		line-height: 1.6;
		white-space: pre;
	}

	figcaption {
		font-size: 0.82rem;
		color: var(--docs-text-muted);
	}
</style>
