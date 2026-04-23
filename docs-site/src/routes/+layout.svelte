<script lang="ts">
	import '../app.css';
	import DocPagination from '$lib/components/DocPagination.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { nav } from '$lib/nav.js';
	import { page } from '$app/stores';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	const currentPath = $derived($page.url.pathname);
</script>

<div class="docs-shell">
	<nav class="sidebar" aria-label="Documentation navigation">
		<div class="sidebar-top">
			<a href="/" class="logo">MCS Documentation</a>
			<ThemeToggle />
		</div>

		<div class="sidebar-nav">
			{#each nav as section}
				<div class="nav-section">
					<div class="nav-section-title">{section.title}</div>
					<ul class="nav-list">
						{#each section.items as item}
							<li>
								<a href={item.href} class="nav-link" class:active={currentPath === item.href}>
									{item.label}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</nav>

	<main class="content">
		<div class="content-inner">
			{@render children?.()}
			<DocPagination currentPath={currentPath} />
		</div>
	</main>
</div>

<style>
	.docs-shell {
		display: grid;
		grid-template-columns: minmax(16rem, var(--docs-sidebar-width)) minmax(0, 1fr);
		min-height: 100vh;
	}

	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		padding: 1.5rem 1rem 1.8rem;
		border-right: 1px solid var(--docs-border);
		overflow-y: auto;
		background: var(--docs-shell);
	}

	.sidebar-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		margin-bottom: 1.5rem;
	}

	.logo {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--docs-text);
		text-decoration: none;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.nav-section-title {
		margin-bottom: 0.5rem;
		font-size: 0.84rem;
		font-weight: 500;
		color: var(--docs-text-muted);
	}

	.nav-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.nav-list li + li {
		margin-top: 0.35rem;
	}

	.nav-link {
		display: block;
		padding: 0.45rem 0.65rem;
		border-left: 2px solid transparent;
		font-size: 0.92rem;
		color: var(--docs-text-soft);
		text-decoration: none;
		transition:
			background-color 160ms ease,
			color 160ms ease,
			border-color 160ms ease;
	}

	.nav-link:hover {
		color: var(--docs-text);
		background: color-mix(in srgb, var(--docs-surface-raised) 72%, transparent);
		border-color: var(--docs-border-strong);
	}

	.nav-link.active {
		color: var(--docs-text);
		background: var(--docs-accent-soft);
		border-color: var(--docs-accent);
	}

	.content {
		min-width: 0;
		background: transparent;
	}

	.content-inner {
		max-width: 62rem;
		padding: 3rem 3.25rem 4rem;
	}

	@media (max-width: 900px) {
		.docs-shell {
			grid-template-columns: 1fr;
		}

		.sidebar {
			position: static;
			height: auto;
			padding-bottom: 1.1rem;
			border-right: 0;
			border-bottom: 1px solid var(--docs-border);
		}

		.content-inner {
			padding: 1.75rem 1rem 3rem;
		}
	}

	@media (max-width: 640px) {
		.sidebar-top {
			flex-wrap: wrap;
		}

		.logo {
			font-size: 0.96rem;
		}
	}
</style>
