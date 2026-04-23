<script lang="ts">
	import { onDestroy } from 'svelte';
	import { currentProject, selectedObjectId, selectedObject } from '$lib/stores/project';
	import { clearGalleryObjects } from '$lib/gallery/resolver.js';

	let { children } = $props();

	// Set fake project so CenterContent and view components see a valid project (id: 'gallery')
	currentProject.set({
		id: 'gallery',
		name: 'Gallery',
		path: ''
	});

	onDestroy(() => {
		currentProject.set(null);
		selectedObjectId.set(null);
		selectedObject.set(null);
		clearGalleryObjects();
	});
</script>

<div class="gallery-layout">
	{@render children()}
</div>

<style>
	.gallery-layout {
		display: flex;
		flex-direction: row;
		height: 100vh;
		width: 100%;
		background: var(--mcs-bg);
		color: var(--mcs-text);
	}
</style>
