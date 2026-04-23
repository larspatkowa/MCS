<script lang="ts">
	import { getAdjacentDocs } from '$lib/nav.js';

	interface Props {
		currentPath: string;
	}

	let { currentPath }: Props = $props();

	const adjacent = $derived(getAdjacentDocs(currentPath));
</script>

{#if adjacent.previous || adjacent.next}
	<nav class="doc-pagination" aria-label="Page navigation">
		{#if adjacent.previous}
			<a class="doc-pagination-link" href={adjacent.previous.href}>
				<span class="direction">Previous</span>
				<strong>{adjacent.previous.label}</strong>
			</a>
		{:else}
			<div class="doc-pagination-spacer"></div>
		{/if}

		{#if adjacent.next}
			<a class="doc-pagination-link align-end" href={adjacent.next.href}>
				<span class="direction">Next</span>
				<strong>{adjacent.next.label}</strong>
			</a>
		{:else}
			<div class="doc-pagination-spacer"></div>
		{/if}
	</nav>
{/if}

<style>
	.doc-pagination {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		margin-top: 3rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--docs-border);
	}

	.doc-pagination-link,
	.doc-pagination-spacer {
		min-height: 5.25rem;
	}

	.doc-pagination-link {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.45rem;
		padding: 1rem 1.1rem;
		text-decoration: none;
		color: var(--docs-text);
		background: color-mix(in srgb, var(--docs-surface-strong) 78%, transparent);
		border: 1px solid var(--docs-border);
		transition:
			border-color 160ms ease,
			background-color 160ms ease;
	}

	.doc-pagination-link:hover {
		border-color: var(--docs-border-strong);
		background: color-mix(in srgb, var(--docs-surface-raised) 82%, transparent);
	}

	.align-end {
		text-align: right;
		align-items: flex-end;
	}

	.direction {
		font-size: 0.82rem;
		color: var(--docs-text-muted);
	}

	strong {
		font-size: 1rem;
		line-height: 1.35;
	}

	@media (max-width: 700px) {
		.doc-pagination {
			grid-template-columns: 1fr;
		}

		.align-end {
			text-align: left;
			align-items: flex-start;
		}

		.doc-pagination-spacer {
			display: none;
		}
	}
</style>
