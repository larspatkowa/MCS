<script lang="ts">
	import type { WebPageProps } from '$lib/objects/types.js';

	let { props } = $props<{ objectId: string; props: WebPageProps }>();

	const url = $derived.by(() => {
		try {
			const parsed = new URL(props.url ?? '');
			return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
		} catch {
			return '';
		}
	});
</script>

<div class="web-root">
	{#if url}
		<!-- Scripts run in an opaque origin, so the page cannot reach MCS cookies or APIs. -->
		<iframe
			src={url}
			title={props.label || url}
			sandbox="allow-scripts allow-forms allow-popups"
			referrerpolicy="no-referrer"
			loading="lazy"
		></iframe>
	{:else}
		<p class="empty">Enter an http or https address in the properties panel.</p>
	{/if}
</div>

<style>
	.web-root {
		width: 100%;
		height: 100%;
	}
	iframe {
		display: block;
		width: 100%;
		height: 100%;
		border: none;
		background: #fff;
	}
	.empty {
		margin: 0;
		padding: 2rem 1rem;
		color: var(--mcs-text-muted);
		font-size: 12px;
		text-align: center;
	}
</style>
