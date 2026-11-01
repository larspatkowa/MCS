<script lang="ts">
	import { goto } from '$app/navigation';
	import { docLinks } from '$lib/nav.js';

	let dialogElement: HTMLDialogElement;
	let inputElement: HTMLInputElement;
	let query = $state('');
	let selectedIndex = $state(0);

	const results = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return docLinks.slice(0, 6);

		const terms = term.split(/\s+/).filter(Boolean);
		return docLinks
			.map((item) => {
				const title = item.label.toLowerCase();
				const haystack = `${item.label} ${item.description} ${item.keywords} ${item.section}`.toLowerCase();
				const score = terms.reduce((total, part) => {
					if (title === part) return total + 8;
					if (title.startsWith(part)) return total + 5;
					if (title.includes(part)) return total + 3;
					if (haystack.includes(part)) return total + 1;
					return total;
				}, 0);
				return { item, score, matches: score > 0 };
			})
			.filter((result) => result.matches)
			.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
			.slice(0, 8)
			.map((result) => result.item);
	});

	function openSearch() {
		query = '';
		selectedIndex = 0;
		if (!dialogElement?.open) dialogElement?.showModal();
		requestAnimationFrame(() => inputElement?.focus());
	}

	function closeSearch() {
		if (dialogElement?.open) dialogElement.close();
	}

	function handleInputKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, Math.max(results.length - 1, 0));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (event.key === 'Enter' && results[selectedIndex]) {
			event.preventDefault();
			void goto(results[selectedIndex].href);
			closeSearch();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === dialogElement) closeSearch();
	}

</script>

<button type="button" class="search-trigger" onclick={openSearch} aria-haspopup="dialog" aria-label="Search documentation">
	<svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
		<circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" stroke-width="1.5" />
		<path d="m13.2 13.2 4 4" stroke="currentColor" stroke-width="1.5" />
	</svg>
	<span>Search docs</span>
</button>

<dialog
	bind:this={dialogElement}
	class="search-dialog"
	aria-labelledby="search-title"
	onclick={handleBackdropClick}
	onclose={() => (selectedIndex = 0)}
>
	<div class="search-panel">
		<div class="search-heading">
			<h2 id="search-title">Search documentation</h2>
			<button class="close-search" type="button" onclick={closeSearch}>Close</button>
		</div>
		<label class="visually-hidden" for="docs-search-input">Search pages</label>
		<input
			bind:this={inputElement}
			id="docs-search-input"
			class="search-input"
			bind:value={query}
			oninput={() => (selectedIndex = 0)}
			onkeydown={handleInputKeydown}
			aria-controls="search-results"
			aria-activedescendant={results.length ? `search-result-${selectedIndex}` : undefined}
			placeholder="Search pages, topics, and API routes"
			autocomplete="off"
			spellcheck="false"
		/>
		{#if results.length}
			<ul id="search-results" class="search-results" role="listbox" aria-label="Documentation pages">
				{#each results as result, index (result.href)}
					<li role="option" aria-selected={selectedIndex === index}>
						<a
							id="search-result-{index}"
							href={result.href}
							tabindex="-1"
							class:active={selectedIndex === index}
							onmouseenter={() => (selectedIndex = index)}
							onclick={closeSearch}
						>
							<span class="result-copy">
								<strong>{result.label}</strong>
								<span>{result.description}</span>
							</span>
							<span class="result-section">{result.section}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="no-results" aria-live="polite">No pages match "{query}".</p>
		{/if}
		<p class="search-hint"><kbd>↑</kbd> <kbd>↓</kbd> to move <kbd>Enter</kbd> to open <kbd>Esc</kbd> to close</p>
	</div>
</dialog>

<style>
	.search-trigger {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		width: 100%;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: var(--docs-surface-strong);
		color: var(--docs-text-muted);
		font: inherit;
		font-size: 0.87rem;
		text-align: left;
		cursor: pointer;
		transition: border-color 160ms ease, color 160ms ease;
	}

	.search-trigger:hover {
		border-color: var(--docs-border-strong);
		color: var(--docs-text);
	}

	.search-trigger svg {
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
	}

	.search-trigger span {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.search-hint kbd {
		padding: 0.08rem 0.28rem;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: var(--docs-bg);
		color: var(--docs-text-muted);
		font-size: 0.72rem;
		white-space: nowrap;
	}

	.search-dialog {
		width: min(38rem, calc(100vw - 2rem));
		max-height: min(80vh, 42rem);
		padding: 0;
		border: 1px solid var(--docs-border-strong);
		border-radius: var(--docs-radius);
		background: var(--docs-surface-strong);
		color: var(--docs-text);
	}

	.search-dialog::backdrop {
		background: rgba(0, 0, 0, 0.52);
	}

	.search-panel {
		padding: 1rem;
	}

	.search-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.8rem;
	}

	.search-heading h2 {
		font-size: 1rem;
		letter-spacing: 0;
	}

	.close-search {
		padding: 0.32rem 0.55rem;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: transparent;
		color: var(--docs-text-soft);
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.search-input {
		width: 100%;
		padding: 0.72rem 0.8rem;
		border: 1px solid var(--docs-border-strong);
		border-radius: var(--docs-radius);
		background: var(--docs-bg);
		color: var(--docs-text);
		font: inherit;
		font-size: 1rem;
	}

	.search-input::placeholder {
		color: var(--docs-text-muted);
	}

	.search-results {
		max-height: 52vh;
		margin: 0.75rem -0.4rem 0;
		padding: 0.2rem 0.4rem;
		overflow-y: auto;
		list-style: none;
	}

	.search-results li + li {
		margin-top: 0.18rem;
	}

	.search-results a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.7rem;
		border: 1px solid transparent;
		border-radius: var(--docs-radius);
		color: var(--docs-text);
		text-decoration: none;
	}

	.search-results a:hover,
	.search-results a.active {
		border-color: var(--docs-border);
		background: var(--docs-surface);
	}

	.result-copy {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		min-width: 0;
	}

	.result-copy strong {
		font-size: 0.92rem;
		font-weight: 600;
	}

	.result-copy > span,
	.result-section,
	.search-hint,
	.no-results {
		color: var(--docs-text-muted);
		font-size: 0.8rem;
		line-height: 1.45;
	}

	.result-section {
		flex: 0 0 auto;
	}

	.search-hint {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-top: 0.9rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--docs-border);
	}

	.no-results {
		padding: 1.25rem 0.2rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 520px) {
		.search-panel {
			padding: 0.8rem;
		}

		.result-section {
			display: none;
		}

		.search-hint {
			flex-wrap: wrap;
		}
	}
</style>
