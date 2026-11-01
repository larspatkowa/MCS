<script lang="ts">
	import { browser } from '$app/environment';

	type Theme = 'light' | 'dark';

	const storageKey = 'mcs-docs-theme';
	let theme = $state<Theme>('light');

	function applyTheme(value: Theme) {
		if (!browser) {
			return;
		}

		theme = value;
		document.documentElement.classList.toggle('theme-light', value === 'light');
		document.documentElement.classList.toggle('theme-dark', value === 'dark');
		document.documentElement.style.colorScheme = value;
		localStorage.setItem(storageKey, value);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	if (browser) {
		theme = document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light';
	}
</script>

<button
	type="button"
	class="theme-toggle"
	aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	aria-pressed={theme === 'dark'}
	onclick={toggleTheme}
>
	<svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
		{#if theme === 'dark'}
			<circle cx="10" cy="10" r="3.2" />
			<path d="M10 1.8v2M10 16.2v2M18.2 10h-2M3.8 10h-2m14-5.8-1.4 1.4M5.6 14.4l-1.4 1.4m11.6 0-1.4-1.4M5.6 5.6 4.2 4.2" />
		{:else}
			<path d="M16.5 12.1A6.8 6.8 0 0 1 7.9 3.5a6.8 6.8 0 1 0 8.6 8.6Z" />
		{/if}
	</svg>
</button>

<style>
	.theme-toggle {
		display: inline-grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: var(--docs-surface-strong);
		color: var(--docs-text);
		font: inherit;
		cursor: pointer;
		transition: background-color 160ms ease, border-color 160ms ease;
	}

	.theme-toggle:hover {
		border-color: var(--docs-border-strong);
		background: var(--docs-surface);
	}

	.theme-toggle svg {
		width: 1rem;
		height: 1rem;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.5;
	}
</style>
