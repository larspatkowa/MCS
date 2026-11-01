<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const singleSample = `curl -X POST http://127.0.0.1:8080/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "streamId": "sensor:temperature",
    "timestamp": 1775713608.437,
    "values": { "value": 22.5, "sensor": "payload-bay" }
  }'`;

	const batchSample = `curl -X POST http://127.0.0.1:8080/api/ingest/batch \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "samples": [
      { "streamId": "sensor:temperature", "values": { "value": 22.5 } },
      { "streamId": "sensor:pressure", "values": { "value": 101.3 } }
    ]
  }'`;

	const versionedSample = `curl -X POST http://127.0.0.1:8080/api/ingest/v2 \\
  -H 'Content-Type: application/json' \\
  -H "Authorization: Bearer $MCS_SOURCE_TOKEN" \\
  -d '{
    "version": 1,
    "projectId": "YOUR_PROJECT_ID",
    "source": {
      "id": "flight-computer",
      "name": "Flight computer",
      "timeSystem": "gps",
      "timestampUnit": "milliseconds"
    },
    "samples": [
      {
        "streamId": "navigation:altitude",
        "sourceTimestamp": {
          "value": "1780000000123",
          "unit": "milliseconds",
          "timeSystem": "gps"
        },
        "sequence": 42,
        "idempotencyKey": "flight-computer-42",
        "values": { "altitude": 1520.4 },
        "quality": { "clock": "good", "clockUncertaintySeconds": 0.01 }
      }
    ]
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Ingest API')}</title>
</svelte:head>

<PageHeader
	title="Ingest API"
	description="Send samples with the simple ingest routes, or use the versioned envelope to preserve source clock and quality metadata."
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
				<tr><td><code>POST /api/ingest/v2</code></td><td>Ingest a versioned source envelope with clock metadata.</td><td><code>{`{ "ok": true, "received": n, "accepted": n }`}</code></td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Single sample</h2>
		<CodeBlock lang="bash" title="Single sample request" code={singleSample} />
		<p>
			If <code>timestamp</code> is omitted, the server uses the current Unix time in seconds. Missing
			<code>values</code> becomes an empty payload. A provided value must be a JSON object.
		</p>
	</section>

	<section>
		<h2>Batch ingest</h2>
		<CodeBlock lang="bash" title="Batch request" code={batchSample} />
		<p>
			Batch ingest keeps one <code>projectId</code> at the top level. Individual samples can still
			include their own timestamps. One request can contain at most 5,000 samples, and every sample is
			validated before any are written.
		</p>
	</section>

	<section>
		<h2>Versioned source envelope</h2>
		<p>Use <code>/api/ingest/v2</code> when the sender needs to retain source identity, original clock values, sequence numbers, or quality flags. A request names one project and source. Each sample includes its stream, timestamp, and values.</p>
		<CodeBlock lang="bash" title="Versioned ingest request" code={versionedSample} />
		<p>The source declares a default time system and timestamp unit. A sample can override them. Supported built-in time systems are UTC, GPS, and Unix-aligned TAI. Other time systems need an explicit server-side adapter.</p>
		<p>The response includes the received and accepted counts, accepted sample IDs, and the run ID when a recording is active. A decimal string preserves the original timestamp when an integer exceeds JavaScript's safe number precision.</p>
		<Callout type="info" title="Clock responsibility">
			MCS can normalize a timestamp and apply a configured offset or drift correction. The source owner remains responsible for clock discipline.
		</Callout>
	</section>

	<section>
		<h2>Error behavior</h2>
		<ul>
			<li>Missing <code>projectId</code> or <code>streamId</code> yields HTTP 400.</li>
			<li>Invalid JSON, non-finite timestamps, and non-object values yield HTTP 400.</li>
			<li>An unknown project yields HTTP 404.</li>
			<li>Samples still flow through limit evaluation and SSE broadcasts after they are stored.</li>
		</ul>
		<p>JSON bodies are limited to 1 MiB. Both batch endpoints accept at most 5,000 samples.</p>
		<Callout type="tip" title="Metadata comes later">
			Ingest creates the stream row if needed, but it does not add units, min/max ranges, or
			limit thresholds on its own. Use <a href="/api/streams">the streams API</a> for that.
		</Callout>
	</section>
</article>
