<script lang="ts">
	import '../app.css';
	import DocPagination from '$lib/components/DocPagination.svelte';
	import DocsSearch from '$lib/components/DocsSearch.svelte';
	import TableOfContents from '$lib/components/TableOfContents.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { docLinks, nav } from '$lib/nav.js';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
	let mobileNavigationOpen = $state(false);
	const currentPath = $derived($page.url.pathname);
	const currentDoc = $derived(docLinks.find((item) => item.href === currentPath));
	const currentSection = $derived(
		nav.find((section) => section.items.some((item) => item.href === currentPath))?.title
	);

	afterNavigate(() => {
		mobileNavigationOpen = false;
	});
</script>

<a class="skip-link" href="#documentation-content">Skip to documentation</a>

<div class="docs-shell">
	<aside class="sidebar">
		<div class="sidebar-top">
			<a href="/" class="logo" aria-label="MCS documentation home">
				<span class="logo-name">MCS</span>
				<span class="logo-label">Documentation</span>
			</a>
			<ThemeToggle />
		</div>

		<div class="sidebar-search">
			<DocsSearch />
		</div>

		<button
			type="button"
			class="mobile-navigation-toggle"
			aria-expanded={mobileNavigationOpen}
			aria-controls="docs-navigation"
			onclick={() => (mobileNavigationOpen = !mobileNavigationOpen)}
		>
			<span>{mobileNavigationOpen ? 'Close navigation' : 'Browse documentation'}</span>
			<svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
				<path d={mobileNavigationOpen ? 'm5 5 10 10M15 5 5 15' : 'M3 6h14M3 10h14M3 14h14'} stroke="currentColor" stroke-width="1.5" />
			</svg>
		</button>

		<nav id="docs-navigation" class="sidebar-nav" class:mobile-open={mobileNavigationOpen} aria-label="Documentation navigation">
			{#each nav as section (section.title)}
				<section class="nav-section">
					<h2 class="nav-section-title">{section.title}</h2>
					<ul class="nav-list">
						{#each section.items as item (item.href)}
							<li>
								<a
									href={item.href}
									class="nav-link"
									class:active={currentPath === item.href}
									aria-current={currentPath === item.href ? 'page' : undefined}
								>
									{item.label}
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</nav>
	</aside>

	<main class="content">
		<div class="content-inner">
			<div class="docs-breadcrumb" aria-label="Breadcrumb">
				<a href="/">MCS docs</a>
				<span aria-hidden="true">/</span>
				<span>{currentSection ?? 'Documentation'}</span>
				<span aria-hidden="true">/</span>
				<span aria-current="page">{currentDoc?.label ?? 'Page'}</span>
			</div>

			<div class="reading-layout">
				<div id="documentation-content" class="article-column" tabindex="-1">
					{@render children?.()}
					<DocPagination currentPath={currentPath} />
					<footer class="docs-footer">
						<a href="/">MCS Documentation</a>
						<span>Built for the MCS source tree in this repository.</span>
					</footer>
				</div>
				<TableOfContents />
			</div>
		</div>
	</main>
</div>

<style>
	.skip-link {
		position: fixed;
		z-index: 20;
		top: 0.75rem;
		left: 0.75rem;
		transform: translateY(-180%);
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--docs-border-strong);
		border-radius: var(--docs-radius);
		background: var(--docs-surface-raised);
		color: var(--docs-text);
		text-decoration: none;
	}

	.skip-link:focus {
		transform: translateY(0);
	}

	.docs-shell {
		display: grid;
		grid-template-columns: minmax(16rem, var(--docs-sidebar-width)) minmax(0, 1fr);
		min-height: 100vh;
	}

	.sidebar {
		position: sticky;
		top: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-self: start;
		height: 100vh;
		padding: 1.4rem 1rem 1.6rem;
		border-right: 1px solid var(--docs-border);
		overflow-y: auto;
		background: var(--docs-shell);
	}

	.sidebar-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.logo {
		display: flex;
		flex-direction: column;
		gap: 0.04rem;
		color: var(--docs-text);
		text-decoration: none;
	}

	.logo-name {
		font-size: 1.08rem;
		font-weight: 700;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.logo-label {
		color: var(--docs-text-muted);
		font-size: 0.77rem;
		line-height: 1.3;
	}

	.sidebar-search {
		margin-bottom: 0.15rem;
	}

	.mobile-navigation-toggle {
		display: none;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		padding: 0.68rem 0.75rem;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: var(--docs-surface-strong);
		color: var(--docs-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.mobile-navigation-toggle svg {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
	}

	.sidebar-nav {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 0 0.12rem 1rem;
	}

	.nav-section-title {
		margin: 0 0 0.42rem;
		padding: 0 0.5rem;
		color: var(--docs-text-muted);
		font-size: 0.78rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.nav-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nav-list li + li {
		margin-top: 0.12rem;
	}

	.nav-link {
		display: block;
		padding: 0.38rem 0.55rem;
		border: 1px solid transparent;
		border-radius: var(--docs-radius);
		color: var(--docs-text-soft);
		font-size: 0.88rem;
		line-height: 1.42;
		text-decoration: none;
		transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
	}

	.nav-link:hover {
		border-color: var(--docs-border-strong);
		background: color-mix(in srgb, var(--docs-surface-raised) 72%, transparent);
		color: var(--docs-text);
	}

	.nav-link.active {
		border-color: var(--docs-accent);
		background: var(--docs-accent-soft);
		color: var(--docs-text);
	}

	.content {
		min-width: 0;
	}

	.content-inner {
		width: 100%;
		max-width: 82rem;
		margin: 0 auto;
		padding: 1.35rem 2.5rem 3.5rem;
	}

	.docs-breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		margin-bottom: 2.1rem;
		color: var(--docs-text-muted);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.docs-breadcrumb a {
		color: var(--docs-text-soft);
		text-decoration: none;
	}

	.docs-breadcrumb a:hover {
		color: var(--docs-accent);
		text-decoration: underline;
	}

	.docs-breadcrumb span:last-child {
		color: var(--docs-text);
		font-weight: 500;
	}

	.reading-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 11rem;
		align-items: start;
		gap: 2.5rem;
	}

	.article-column {
		min-width: 0;
		max-width: 62rem;
	}

	.docs-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1rem;
		margin-top: 2.75rem;
		padding-top: 1rem;
		border-top: 1px solid var(--docs-border);
		color: var(--docs-text-muted);
		font-size: 0.78rem;
	}

	.docs-footer a {
		color: var(--docs-text-soft);
		text-decoration: none;
	}

	.article-column:focus {
		outline: none;
	}

	:global(:focus-visible) {
		outline: 2px solid var(--docs-accent);
		outline-offset: 2px;
	}

	@media (max-width: 1120px) {
		.content-inner {
			padding-right: 2rem;
			padding-left: 2rem;
		}

		.reading-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		:global(.toc) {
			display: none;
		}
	}

	@media (max-width: 900px) {
		.docs-shell {
			grid-template-columns: 1fr;
		}

		.sidebar {
			position: sticky;
			z-index: 10;
			height: auto;
			max-height: 100vh;
			gap: 0.75rem;
			padding: 0.7rem 1rem;
			border-right: 0;
			border-bottom: 1px solid var(--docs-border);
		}

		.sidebar-top {
			min-height: 2.35rem;
		}

		.sidebar-search {
			margin: 0;
		}

		.mobile-navigation-toggle {
			display: flex;
		}

		.sidebar-nav {
			display: none;
			max-height: min(62vh, 34rem);
			padding: 0.25rem 0 0.5rem;
			overflow-y: auto;
		}

		.sidebar-nav.mobile-open {
			display: flex;
		}

		.content-inner {
			padding: 1.2rem 1.35rem 3rem;
		}

		.docs-breadcrumb {
			margin-bottom: 1.5rem;
		}
	}

	@media (max-width: 520px) {
		.sidebar {
			padding-right: 0.8rem;
			padding-left: 0.8rem;
		}

		.content-inner {
			padding: 1rem 1rem 2.5rem;
		}

		.docs-breadcrumb {
			gap: 0.35rem;
			margin-bottom: 1.35rem;
			font-size: 0.73rem;
		}
	}
</style>
