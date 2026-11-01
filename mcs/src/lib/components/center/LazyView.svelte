<script lang="ts">
	/**
	 * Wrapper component that resolves a lazy-loaded view component.
	 * Used by grid and flex containers to render children
	 * whose view components may not be loaded yet.
	 */
	import { getView, resolveView, hasView } from '$lib/object-types/views.js';
	import UnknownView from './UnknownView.svelte';
	import type { Component } from 'svelte';

	let {
		typeId,
		objectId,
		props
	}: { typeId: string; objectId: string; props: Record<string, unknown> } = $props();

	let resolved: Component<any> | null = $state(null);
	let lastType = $state('');

	$effect(() => {
		const tid = typeId;

		// Fast path: already cached
		const sync = getView(tid);
		if (sync) {
			resolved = sync;
			lastType = tid;
			return;
		}

		if (!hasView(tid)) {
			resolved = null;
			lastType = tid;
			return;
		}

		// Async resolve
		lastType = tid;
		resolved = null;
		resolveView(tid).then((comp) => {
			if (lastType === tid && comp) {
				resolved = comp;
			}
		});
	});
</script>

{#if resolved && lastType === typeId}
	{@const ViewComponent = resolved}
	<ViewComponent {objectId} {props} />
{:else if hasView(typeId)}
	<div class="lazy-loading">Loading…</div>
{:else}
	<UnknownView {typeId} />
{/if}

<style>
	.lazy-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 0.85rem;
		font-style: italic;
	}
</style>
