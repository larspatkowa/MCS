<script lang="ts">
	import { highlightCode, normalizeLanguage } from '$lib/highlight.js';

	interface Props {
		code: string;
		lang?: string;
		title?: string;
	}

	let { code, lang = 'text', title }: Props = $props();
	let copied = $state(false);
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const trimmedCode = $derived(code.trim());
	const normalizedLanguage = $derived(normalizeLanguage(lang));
	const highlightedCode = $derived(highlightCode(trimmedCode, normalizedLanguage));

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(trimmedCode);
			copied = true;
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				copied = false;
			}, 1500);
		} catch {
			copied = false;
		}
	}
</script>

<div class="code-block">
	<div class="code-title">
		<div class="code-meta">
			{#if title}
				<span class="filename">{title}</span>
			{/if}
			<span class="lang">{normalizedLanguage}</span>
		</div>
		<button type="button" class="copy-button" onclick={copyCode}>
			{copied ? 'Copied' : 'Copy'}
		</button>
	</div>
	<pre class="code-body language-{normalizedLanguage}">
		<code class="language-{normalizedLanguage}">{@html highlightedCode}</code>
	</pre>
</div>

<style>
	.code-block {
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: var(--docs-code-bg);
		margin: 0.35rem 0;
		font-family: var(--docs-font-mono);
		overflow: hidden;
	}

	.code-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.45rem 0.7rem;
		background: color-mix(in srgb, var(--docs-code-header) 92%, transparent);
		border-bottom: 1px solid var(--docs-border);
	}

	.code-meta {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		min-width: 0;
	}

	.filename {
		font-size: 0.82rem;
		color: var(--docs-text-soft);
		font-family: var(--docs-font-mono);
	}

	.lang {
		display: inline-flex;
		align-items: center;
		padding: 0.14rem 0.42rem;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		font-size: 0.72rem;
		color: var(--docs-text-muted);
		background: color-mix(in srgb, var(--docs-surface-raised) 72%, transparent);
	}

	.copy-button {
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: transparent;
		color: var(--docs-text-muted);
		padding: 0.22rem 0.58rem;
		font: inherit;
		font-size: 0.76rem;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background-color 160ms ease,
			color 160ms ease;
	}

	.copy-button:hover {
		color: var(--docs-text);
		border-color: var(--docs-border-strong);
		background: color-mix(in srgb, var(--docs-surface-raised) 72%, transparent);
	}

	.code-body {
		margin: 0;
		padding: 1rem 1.05rem 1.1rem;
		overflow-x: auto;
		font-size: 0.82rem;
		line-height: 1.68;
		color: var(--docs-text-soft);
	}

	code {
		background: none;
		padding: 0;
		font-size: inherit;
		color: inherit;
		font-family: var(--docs-font-mono);
	}
</style>
