<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Media and rendering')}</title></svelte:head>

<PageHeader
	title="Media and rendering"
	description="Images and video are stored with a project. A video track can follow the playhead of a saved run."
/>

<article class="doc-page">
	<section>
		<h2>Add an image or video</h2>
		<p>Import media into a project rather than linking a view to an arbitrary path on the server. MCS stores imported files by content hash under <code>.mcs/media/</code>. The API returns an asset ID and a same-project file route.</p>
		<p>An image view displays a static asset. A video view points to a timestamped media track that can be bound to a run. The file, duration, frame rate, audio metadata, and sync settings belong to that track.</p>
		<p>See <a href="/components/media">image and video views</a> and the <a href="/api/media">media API</a>.</p>
	</section>

	<section>
		<h2>Align video with a run</h2>
		<p>A binding associates an asset with a run. Its offset and rate map a run timestamp to a media timestamp. Optional timestamp anchors provide additional alignment points. During replay, MCS uses the shared playhead to choose the video time and frame.</p>
		<p>Check a known timestamp at the start and end of a recording before relying on the alignment. MCS does not calibrate capture hardware or repair the source clock.</p>
	</section>

	<section>
		<h2>Export a render</h2>
		<p>A render job seeks the shared project clock for each frame. It writes a deterministic PNG sequence and a manifest under <code>.mcs/renders/</code>. If <code>ffmpeg</code> is available, MCS can also encode H.264 or ProRes.</p>
		<p>The frame sequence remains available when no encoder is installed. An unavailable or failed encoder is reported as such; MCS does not return a video path for a failed encode.</p>
		<p>Use the <a href="/api/media">render job routes</a> for request fields, limits, and output URLs.</p>
	</section>

	<section>
		<h2>Project storage</h2>
		<p>Media files and render output are project data. Include them in a <a href="/guides/backup-restore">project backup</a> if the restored workspace needs the same media and exported frames.</p>
	</section>
</article>
