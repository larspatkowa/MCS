<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { onMount, tick } from 'svelte';

	interface HeadingLink {
		id: string;
		label: string;
		level: number;
	}

	let headings = $state<HeadingLink[]>([]);

	function slugFor(value: string): string {
		return value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'section';
	}

	async function collectHeadings() {
		await tick();
		const usedIds = new Set<string>();
		const elements = document.querySelectorAll<HTMLElement>(
			'#documentation-content .doc-page h2, #documentation-content .doc-page h3'
		);
		headings = Array.from(elements).map((element) => {
			const label = element.textContent?.trim() ?? '';
			const baseId = element.id || slugFor(label);
			let id = baseId;
			let suffix = 2;
			while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
			usedIds.add(id);
			element.id = id;
			return { id, label, level: Number(element.tagName.slice(1)) };
		});
	}

	afterNavigate(() => {
		void collectHeadings();
	});

	onMount(() => {
		void collectHeadings();
	});
</script>

{#if headings.length}
	<nav class="toc" aria-label="On this page">
		<h2>On this page</h2>
		<ul>
			{#each headings as heading (heading.id)}
				<li class:subsection={heading.level === 3}>
					<a href="#{heading.id}">{heading.label}</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	.toc {
		position: sticky;
		top: 2rem;
		align-self: start;
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
		padding-left: 1rem;
		border-left: 1px solid var(--docs-border);
	}

	.toc h2 {
		margin-bottom: 0.75rem;
		font-size: 0.82rem;
		font-weight: 600;
		letter-spacing: 0;
	}

	.toc ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.toc li + li {
		margin-top: 0.42rem;
	}

	.toc li.subsection {
		padding-left: 0.7rem;
	}

	.toc a {
		color: var(--docs-text-muted);
		font-size: 0.82rem;
		line-height: 1.4;
		text-decoration: none;
	}

	.toc a:hover {
		color: var(--docs-text);
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}
</style>
