<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { docTitle } from '$lib/nav.js';

	const importRun = `curl -X POST http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID/runs/import \\
  -F file=@run.ndjson`;
	const exportRun = `curl http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID/runs/RUN_ID/export \\
  --output run.ndjson`;
	const pauseRun = `curl -X POST http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID/runs/RUN_ID \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"pause"}'`;
</script>

<svelte:head>
	<title>{docTitle('Runs API')}</title>
</svelte:head>

<PageHeader
	title="Runs API"
	description="Run routes start and control recordings, import files, page through replay data, and export versioned packages."
/>

<article class="doc-page">
	<section>
		<h2>Lifecycle</h2>
		<table>
			<thead><tr><th>Route</th><th>Use</th></tr></thead>
			<tbody>
				<tr><td><code>GET /api/projects/:id/runs</code></td><td>Read the active run and a bounded recent list. The default limit is 50; the maximum is 200.</td></tr>
				<tr><td><code>POST /api/projects/:id/runs</code></td><td>Start a recording.</td></tr>
				<tr><td><code>GET /api/projects/:id/runs/:runId</code></td><td>Read run details and health metrics.</td></tr>
				<tr><td><code>POST /api/projects/:id/runs/:runId</code></td><td>Pause, resume, or stop a recording.</td></tr>
				<tr><td><code>GET /api/projects/:id/runs/:runId/replay</code></td><td>Read a bounded, sampled series for a time range.</td></tr>
				<tr><td><code>GET /api/projects/:id/runs/:runId/events</code></td><td>Read ordered events in cursor-paged batches.</td></tr>
				<tr><td><code>POST /api/projects/:id/runs/import</code></td><td>Import CSV, JSON, or NDJSON as a finalized run.</td></tr>
				<tr><td><code>GET /api/projects/:id/runs/:runId/export</code></td><td>Export a run package.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Control a recording</h2>
		<p>Start with <code>POST /runs</code>. A project can have one active or paused run. Send <code>pause</code>, <code>resume</code>, or <code>stop</code> to the run route.</p>
		<CodeBlock lang="bash" title="Pause a run" code={pauseRun} />
		<p>When a run is active, a batch ingest request without <code>runId</code> is associated with it. A supplied run ID must match the active recording.</p>
	</section>

	<section>
		<h2>Import and export</h2>
		<CodeBlock lang="bash" title="Import a run" code={importRun} />
		<CodeBlock lang="bash" title="Export the same run" code={exportRun} />
		<p>
			The canonical package is versioned NDJSON with a header, stream metadata, sample records, optional
			media tracks, health records, and a SHA-256 integrity footer. Imports also accept CSV, JSON, and
			plain NDJSON. Use the multipart field <code>file</code>; optional fields include
			<code>format</code>, <code>timestampUnit</code>, <code>streamId</code>, and <code>name</code>.
		</p>
	</section>

	<section>
		<h2>Replay reads</h2>
		<p>The <code>/replay</code> route accepts optional <code>start</code>, <code>end</code>, <code>limit</code>, and <code>streamId</code> query parameters. Use it for chart-sized data. The <code>/events</code> route returns full-fidelity events with a cursor for the next page.</p>
		<p>Replay does not read samples from other runs. Raw samples remain authoritative; derived samples are separate events with their transform provenance.</p>
	</section>
</article>
