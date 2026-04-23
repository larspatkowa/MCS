<script lang="ts">
	import type { HyperlinkProps } from '$lib/objects/types.js';
	import { ExternalLink, Link } from '@lucide/svelte';

	let { objectId, props } = $props<{ objectId: string; props: HyperlinkProps }>();

	const url = $derived(props.url ?? '');
	const displayText = $derived(props.displayText || props.url || 'No URL configured');
	const newTab = $derived(props.newTab !== false);
</script>

<div class="hl-root">
	{#if url}
		<a
			class="hl-link"
			href={url}
			target={newTab ? '_blank' : undefined}
			rel={newTab ? 'noopener noreferrer' : undefined}
		>
			<Link size={16} />
			<span class="hl-text">{displayText}</span>
			{#if newTab}
				<ExternalLink size={12} />
			{/if}
		</a>
		<span class="hl-url">{url}</span>
	{:else}
		<div class="empty">
			<Link size={20} />
			<span>Configure a URL in properties</span>
		</div>
	{/if}
</div>

<style>
	.hl-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 4px;
		padding: 12px 16px;
		font-family: var(--mcs-font-sans);
	}

	.hl-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--mcs-accent, #4f9cf9);
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.hl-link:hover {
		opacity: 0.8;
		text-decoration: underline;
	}

	.hl-text {
		font-size: 13px;
		font-weight: 500;
	}

	.hl-url {
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		color: var(--mcs-text-muted);
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: var(--mcs-text-muted);
		font-size: 12px;
	}
</style>
