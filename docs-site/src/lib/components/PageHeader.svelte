<script lang="ts">
	interface Props {
		title: string;
		badge?: string;
		description?: string;
	}

	let { title, badge, description }: Props = $props();
</script>

<header class="page-header">
	{#if badge}
		<p class="badge">{badge}</p>
	{/if}
	<h1>{title}</h1>
	{#if description}
		<p class="description">{description}</p>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0 0 1.5rem;
		margin-bottom: 1.9rem;
		border-bottom: 1px solid var(--docs-border);
	}

	h1 {
		font-size: clamp(2.3rem, 4.4vw, 3.25rem);
		letter-spacing: -0.03em;
	}

	.badge {
		margin: 0;
		display: inline-flex;
		align-items: center;
		width: fit-content;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--docs-border);
		font-size: 0.76rem;
		font-family: var(--docs-font-mono);
		letter-spacing: 0.04em;
		font-weight: 500;
		color: var(--docs-accent-strong);
		background: var(--docs-accent-soft);
	}

	.description {
		margin: 0;
		font-size: 1rem;
		line-height: 1.65;
		color: var(--docs-text-soft);
		max-width: 46rem;
	}
</style>
