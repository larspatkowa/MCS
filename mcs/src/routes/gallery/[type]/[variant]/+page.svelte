<script lang="ts">
	import { goto } from '$app/navigation';
	import { getGalleryEntry, getDefaultEntry } from '$lib/gallery/catalog.js';
	import { getType } from '$lib/object-types/registry.js';
	import { setGalleryObjects } from '$lib/gallery/resolver.js';
	import { selectedObjectId, selectedObject } from '$lib/stores/project';
	import GallerySidebar from '$lib/gallery/GallerySidebar.svelte';
	import CenterView from '$lib/components/layout/CenterView.svelte';

	let { data } = $props();

	const typeId = $derived(data.params.type);
	const variantId = $derived(data.params.variant);
	const entry = $derived(getGalleryEntry(typeId, variantId));
	const result = $derived(entry ? entry.buildObjects() : null);
	const typeInfo = $derived(getType(typeId));
	const typeLabel = $derived(typeInfo?.label ?? typeId);
	const docTitle = $derived(
		entry && result ? `${typeLabel} — ${entry.label ?? variantId} — MCS` : 'Gallery — MCS'
	);

	$effect(() => {
		const e = entry;
		const res = result;
		if (!e) {
			const def = getDefaultEntry();
			goto(`/gallery/${def.typeId}/${def.variantId}`, { replaceState: true });
			return;
		}
		if (res) {
			setGalleryObjects(res.objects);
			selectedObjectId.set(res.rootId);
			const root = res.objects.get(res.rootId);
			if (root) selectedObject.set(root);
		}
	});
</script>

<svelte:head>
	<title>{docTitle}</title>
</svelte:head>

{#if entry && result}
	<div class="gallery-shell">
		<aside class="gallery-sidebar-wrap">
			<GallerySidebar currentType={typeId} currentVariant={variantId} />
		</aside>
		<main class="gallery-main">
			<CenterView />
		</main>
	</div>
{:else}
	<div class="gallery-loading">Loading…</div>
{/if}

<style>
	.gallery-shell {
		display: flex;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--mcs-bg);
	}
	.gallery-sidebar-wrap {
		flex-shrink: 0;
		width: 280px;
		border-right: 1px solid var(--mcs-border);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.gallery-main {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}
	.gallery-loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--mcs-text-muted);
	}
	@media (max-width: 1024px) {
		.gallery-sidebar-wrap {
			width: 250px;
		}
	}
	@media (max-width: 860px) {
		.gallery-sidebar-wrap {
			width: 220px;
		}
	}
</style>
