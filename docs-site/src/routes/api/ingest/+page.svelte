<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const singleSample = `curl -X POST http://localhost:6000/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "streamId": "demo:temperature",
    "timestamp": 1775713608.437,
    "values": { "value": 22.5, "sensor": "payload-bay" }
  }'`;

	const batchSample = `curl -X POST http://localhost:6000/api/ingest/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "samples": [
      { "streamId": "demo:temperature", "values": { "value": 22.5 } },
      { "streamId": "demo:pressure", "values": { "value": 101.3 } }
    ]
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Ingest API')}</title>
</svelte:head>

<PageHeader
	title="Ingest API"
	description="The ingest routes are the shortest path into MCS. They accept JSON, create missing streams on demand, and send samples through the same limit and SSE path used by plugins."
/>

<article class="doc-page">
	<section>
		<h2>Routes</h2>
		<table>
			<thead>
				<tr><th>Route</th><th>Use</th><th>Response</th></tr>
			</thead>
			<tbody>
				<tr><td><code>POST /api/ingest</code></td><td>Ingest one sample.</td><td><code>{`{ "ok": true }`}</code></td></tr>
				<tr><td><code>POST /api/ingest/batch</code></td><td>Ingest many samples for one project.</td><td><code>{`{ "ok": true, "count": n }`}</code></td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Single sample</h2>
		<CodeBlock lang="bash" title="Single sample request" code={singleSample} />
		<p>
			If <code>timestamp</code> is omitted, the server uses the current Unix time in seconds. If
			<code>values</code> is missing or not an object, the server stores an empty payload.
		</p>
	</section>

	<section>
		<h2>Batch ingest</h2>
		<CodeBlock lang="bash" title="Batch request" code={batchSample} />
		<p>
			Batch ingest keeps one <code>projectId</code> at the top level. Individual samples can still
			include their own timestamps.
		</p>
	</section>

	<section>
		<h2>Error behavior</h2>
		<ul>
			<li>Missing <code>projectId</code> or <code>streamId</code> yields HTTP 400.</li>
			<li>An unknown project yields HTTP 404.</li>
			<li>Samples still flow through limit evaluation and SSE broadcasts after they are stored.</li>
		</ul>
		<Callout type="tip" title="Metadata comes later">
			Ingest creates the stream row if needed, but it does not add units, min/max ranges, or
			limit thresholds on its own. Use <a href="/api/streams">the streams API</a> for that.
		</Callout>
	</section>
</article>
