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
		document.documentElement.dataset.theme = value;
		document.documentElement.style.colorScheme = value;
		localStorage.setItem(storageKey, value);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	if (browser) {
		const currentTheme = document.documentElement.dataset.theme;
		theme = currentTheme === 'dark' ? 'dark' : 'light';
	}
</script>

<button
	type="button"
	class="theme-toggle"
	aria-label="Toggle theme"
	aria-pressed={theme === 'dark'}
	onclick={toggleTheme}
>
	<span class="theme-track" aria-hidden="true">
		<span class="theme-thumb"></span>
	</span>
	<span class="theme-label">Theme</span>
</button>

<style>
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--docs-border);
		background: color-mix(in srgb, var(--docs-surface-strong) 80%, transparent);
		color: var(--docs-text-muted);
		font: inherit;
		font-size: 0.86rem;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background-color 160ms ease,
			color 160ms ease;
	}

	.theme-toggle:hover {
		color: var(--docs-text);
		border-color: var(--docs-border-strong);
		background: color-mix(in srgb, var(--docs-surface-strong) 92%, transparent);
	}

	.theme-toggle:focus-visible {
		outline: 2px solid var(--docs-accent);
		outline-offset: 2px;
	}

	.theme-track {
		position: relative;
		width: 2.5rem;
		height: 1.4rem;
		background: color-mix(in srgb, var(--docs-surface-raised) 86%, var(--docs-border));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--docs-border) 82%, transparent);
	}

	.theme-thumb {
		position: absolute;
		top: 0.16rem;
		left: 0.18rem;
		width: 1.08rem;
		height: 1.08rem;
		background: var(--docs-accent);
		transition: transform 180ms ease;
	}

	[aria-pressed='true'] .theme-thumb {
		transform: translateX(1.08rem);
	}

	.theme-label {
		font-weight: 500;
	}
</style>
