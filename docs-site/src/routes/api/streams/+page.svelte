<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const declareStreams = `curl -X POST http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID/streams/declare \\
  -H "Content-Type: application/json" \\
  -d '{
    "streams": [
      {
        "id": "weather:temperature",
        "name": "Temperature",
        "fields": [
          {
            "field": "value",
            "unit": "°C",
            "min": -40,
            "max": 125,
            "yellowHigh": 35,
            "redHigh": 45
          }
        ]
      }
    ]
  }'`;

	const updateLimits = `curl -X PUT http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID/streams/weather%3Atemperature/limits \\
  -H "Content-Type: application/json" \\
  -d '{
    "field": "value",
    "yellowHigh": 35,
    "redHigh": 45,
    "enabled": true
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Streams API')}</title>
</svelte:head>

<PageHeader
	title="Streams API"
	description="Stream routes cover metadata, historical samples, limits, annotations, and live SSE event feeds."
/>

<article class="doc-page">
	<section>
		<h2>Metadata and samples</h2>
		<table>
			<thead>
				<tr><th>Route</th><th>Use</th></tr>
			</thead>
			<tbody>
				<tr><td><code>GET /api/projects/:id/streams</code></td><td>List stream ids, names, and metadata.</td></tr>
				<tr><td><code>GET /api/projects/:id/streams/:streamId</code></td><td>Return the latest sample summary, or <code>{`{ data: [...] }`}</code> when <code>from</code>/<code>to</code> is present.</td></tr>
				<tr><td><code>GET /api/projects/:id/streams/:streamId/samples</code></td><td>Return historical samples for <code>start</code>/<code>end</code> or <code>from</code>/<code>to</code>.</td></tr>
				<tr><td><code>PUT /api/projects/:id/streams/:streamId</code></td><td>Update the stream name and metadata blob.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Declaration</h2>
		<CodeBlock lang="bash" title="Declare streams" code={declareStreams} />
		<p>
			Declaration merges field metadata into the stream metadata under <code>_fields</code> and
			also applies any yellow or red thresholds included in the field definitions.
		</p>
	</section>

	<section>
		<h2>Limits and events</h2>
		<table>
			<thead>
				<tr><th>Route</th><th>Use</th></tr>
			</thead>
			<tbody>
				<tr><td><code>GET /api/projects/:id/streams/:streamId/limits</code></td><td>List limit configs for one stream.</td></tr>
				<tr><td><code>PUT /api/projects/:id/streams/:streamId/limits</code></td><td>Create or replace one field limit config.</td></tr>
				<tr><td><code>DELETE /api/projects/:id/streams/:streamId/limits?field=value</code></td><td>Delete one field limit config.</td></tr>
				<tr><td><code>GET /api/projects/:id/limit-events</code></td><td>List emitted limit events.</td></tr>
				<tr><td><code>POST /api/projects/:id/limit-events?action=ack-all</code></td><td>Acknowledge all limit events, optionally scoped by stream.</td></tr>
				<tr><td><code>PATCH /api/projects/:id/limit-events/:eventId</code></td><td>Acknowledge one event.</td></tr>
				<tr><td><code>DELETE /api/projects/:id/limit-events/:eventId</code></td><td>Delete one event.</td></tr>
			</tbody>
		</table>
		<CodeBlock lang="bash" title="Update a limit" code={updateLimits} />
	</section>

	<section>
		<h2>Annotations and live streams</h2>
		<ul>
			<li><code>GET /api/projects/:id/annotations</code> lists annotations for a time range.</li>
			<li><code>POST /api/projects/:id/annotations</code> creates one annotation from <code>{`{ ts, label, details? }`}</code>.</li>
			<li><code>DELETE /api/projects/:id/annotations/:annotationId</code> removes one annotation.</li>
			<li><code>GET /api/projects/:id/streams/events</code> opens an SSE feed for stream and limit events.</li>
		</ul>
		<Callout type="info" title="Latest sample shortcut">
			The plain <code>GET /streams/:streamId</code> route returns the latest value summary. Use the
			<code>/samples</code> route when you always want <code>{`{ data: [...] }`}</code>.
		</Callout>
	</section>
</article>
