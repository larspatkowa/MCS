<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const startRun = `curl -X POST http://127.0.0.1:8080/api/projects/PROJECT_ID/runs \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"start","metadata":{"source":"capture-bridge"}}'`;
	const sendSample = `curl -X POST http://127.0.0.1:8080/api/ingest/batch \\
  -H 'Content-Type: application/json' \\
  -d '{"projectId":"PROJECT_ID","samples":[{"streamId":"sensor:raw","timestamp":1786137600,"values":{"value":42}}]}'`;
	const stopRun = `curl -X POST http://127.0.0.1:8080/api/projects/PROJECT_ID/runs/RUN_ID \\
  -H 'Content-Type: application/json' \\
  -d '{"action":"stop"}'`;
</script>

<svelte:head><title>{docTitle('Record and replay runs')}</title></svelte:head>

<PageHeader
	title="Record and replay runs"
	description="Use a run when a recording needs its own start, end, health summary, and replay controls."
/>

<article class="doc-page">
	<section>
		<h2>Start a recording</h2>
		<CodeBlock lang="bash" title="Start a run" code={startRun} />
		<p>The response contains the new run, including its ID. A project can have one active or paused run at a time. The optional metadata object can store labels supplied by the acquisition system.</p>
	</section>

	<section>
		<h2>Send samples into the run</h2>
		<CodeBlock lang="bash" title="Send a batch" code={sendSample} />
		<p>While a run is active, a batch without <code>runId</code> is associated with that run. A sender can include the active run ID explicitly. MCS rejects a stale or unknown ID instead of attaching the data to another run.</p>
		<Callout type="info" title="No active run">
			A batch without a <code>runId</code> and without an active run goes to the bounded live preview. It is not added to the durable telemetry tables.
		</Callout>
	</section>

	<section>
		<h2>Pause, resume, or stop</h2>
		<CodeBlock lang="bash" title="Stop the run" code={stopRun} />
		<p>Send <code>pause</code>, <code>resume</code>, or <code>stop</code> in the same request body. Stopping finalizes the run. The run list and run detail routes return its status and health metrics.</p>
	</section>

	<section>
		<h2>Import a recording</h2>
		<p>Use <a href="/api/runs">the run import route</a> for CSV, JSON, or NDJSON files. Imports create a finalized run directly. They do not pass through live ingest.</p>
		<p>The versioned NDJSON package includes a header, stream metadata, sample records, optional media tracks, health records, and an integrity footer. Raw samples remain authoritative. Derived values are stored as separate events.</p>
	</section>

	<section>
		<h2>Replay and export</h2>
		<p>Loading a run sets one shared playhead for the project. Views read that clock rather than keeping separate playback state. Use the bounded replay endpoint for chart-sized series, or the cursor-paged events endpoint when a consumer needs every event.</p>
		<p>See <a href="/api/runs">run routes and package formats</a> and <a href="/guides/media">media and rendering</a>.</p>
	</section>
</article>
