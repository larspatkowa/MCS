<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const uploadMedia = `curl -X POST http://127.0.0.1:8080/api/projects/PROJECT_ID/media \\
  -F file=@capture.mp4 \\
  -F runId=RUN_ID \\
  -F offsetUs=0 \\
  -F rate=1`;

	const createRender = `curl -X POST http://127.0.0.1:8080/api/projects/PROJECT_ID/render-jobs \\
  -H 'Content-Type: application/json' \\
  -d '{
    "objectId": "OBJECT_ID",
    "runId": "RUN_ID",
    "start": 1786137600,
    "end": 1786137660,
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "format": "h264"
  }'`;
</script>

<svelte:head><title>{docTitle('Media and render jobs API')}</title></svelte:head>

<PageHeader
	title="Media and render jobs API"
	description="Upload project media, bind an asset to a run, and request a bounded render job."
/>

<article class="doc-page">
	<section>
		<h2>Media routes</h2>
		<table>
			<thead><tr><th>Route</th><th>Use</th></tr></thead>
			<tbody>
				<tr><td><code>GET /api/projects/:id/media</code></td><td>List assets and bindings. Add <code>?runId=</code> to filter bindings.</td></tr>
				<tr><td><code>POST /api/projects/:id/media</code></td><td>Upload a multipart file. Optional fields bind it to a run.</td></tr>
				<tr><td><code>GET /api/projects/:id/media/:assetId</code></td><td>Read asset metadata.</td></tr>
				<tr><td><code>GET /api/projects/:id/media/:assetId/file</code></td><td>Read the stored media file.</td></tr>
				<tr><td><code>GET /api/projects/:id/media/bindings</code></td><td>List bindings, optionally filtered by run.</td></tr>
				<tr><td><code>POST /api/projects/:id/media/bindings</code></td><td>Create a run-to-media binding.</td></tr>
				<tr><td><code>GET /api/projects/:id/media/bindings/:bindingId</code></td><td>Read one binding.</td></tr>
				<tr><td><code>PUT /api/projects/:id/media/bindings/:bindingId</code></td><td>Update a binding.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Upload and bind a file</h2>
		<CodeBlock lang="bash" title="Upload video and bind it" code={uploadMedia} />
		<p>The upload response includes the asset, optional binding, and project-scoped file URL. A binding maps run time to media time using an offset and rate. Timestamp anchors can be added to a binding for additional alignment points.</p>
	</section>

	<section>
		<h2>Create a render job</h2>
		<CodeBlock lang="bash" title="Request an H.264 render" code={createRender} />
		<p><code>POST /api/projects/:id/render-jobs</code> returns HTTP 202 with the queued job. Poll <code>GET /api/projects/:id/render-jobs/:jobId</code> for status. A completed job exposes a download URL when video encoding succeeded and a frame sequence URL for its PNG frames.</p>
		<p>Render inputs require finite start and end times with end greater than start. Frame rates range from 1 to 240. Width and height range from 64 to 8,192 pixels. A render is limited to 1,000,000 frames.</p>
	</section>

	<section>
		<h2>Formats and output</h2>
		<p>The supported formats are <code>h264</code> and <code>prores4444</code>. Transparent output requires ProRes. MCS always writes a deterministic PNG frame sequence and manifest. If <code>ffmpeg</code> is missing or encoding fails, the frame sequence remains and the video output is reported as unavailable or failed.</p>
		<Callout type="info" title="Same-origin rendering">
			If a request includes <code>baseUrl</code>, it must use the same origin as the MCS server.
		</Callout>
		<p>See <a href="/guides/media">media and rendering</a> for how views use assets and the replay clock.</p>
	</section>
</article>
