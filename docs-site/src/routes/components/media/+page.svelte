<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Image and video')}</title></svelte:head>

<PageHeader
	title="Image and video"
	badge="Components"
	description="MCS stores imported media with the project. Images are static; video tracks can follow run replay."
/>

<article class="doc-page">
	<section>
		<h2>Image</h2>
		<p>An image object displays a project-owned image asset. Import the file into the project, then select it in the object's properties. MCS serves the stored asset through a project-scoped route.</p>
	</section>

	<section>
		<h2>Video</h2>
		<p>A video object displays an imported media track. Bind the track to a run to map the run's playhead to media time. The binding stores an offset, playback rate, and optional timestamp anchors.</p>
		<Callout type="info" title="Replay alignment">
			The video view follows the shared run clock. Check the offset and anchors against known capture timestamps before using the video to interpret an event.
		</Callout>
	</section>

	<section>
		<h2>Storage and export</h2>
		<p>Imported files are stored by content hash under <code>.mcs/media/</code>. Render jobs can include the video view and preserve a PNG frame sequence. See <a href="/guides/media">media and rendering</a>.</p>
	</section>
</article>
