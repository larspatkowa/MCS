<script lang="ts">
	import type { IframeEmbedProps } from '$lib/objects/types.js';
	import { Globe } from '@lucide/svelte';

	let { objectId, props } = $props<{ objectId: string; props: IframeEmbedProps }>();

	const url = $derived(props.url ?? '');
	const sandbox = $derived(props.sandbox ?? 'allow-scripts allow-same-origin');
	const title = $derived(props.title ?? 'Embedded content');
</script>

<div class="iframe-root">
	{#if url}
		<iframe src={url} {sandbox} {title} allow="fullscreen" loading="lazy" class="embed-frame"
		></iframe>
	{:else}
		<div class="empty">
			<Globe size={24} />
			<span>Configure a URL to embed</span>
		</div>
	{/if}
</div>

<style>
	.iframe-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	.embed-frame {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
		background: var(--mcs-bg);
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 100%;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-sans);
		font-size: 12px;
	}
</style>
