<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Folder')}</title></svelte:head>

<PageHeader
	title="Folder"
	badge="Component"
	description="Use folders to group related objects in the project tree."
/>

<article class="doc-page">
	<section>
		<h2>Organize the tree</h2>
		<p>Create folders under the project root or inside another folder. Drag objects into a folder to group related displays, notes, or layouts. Opening a folder shows its children.</p>
		<p>Folders organize the project. They do not change stream data or playback behavior.</p>
	</section>

	<section>
		<h2>Use folders with layouts</h2>
		<p>A folder keeps objects together in the tree. A <a href="/components/grid-layout">grid layout</a> or <a href="/components/flex-layout">flex layout</a> places display objects together on one screen.</p>
	</section>
</article>
