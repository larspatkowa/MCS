<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { docTitle } from '$lib/nav.js';

	const updateSource = `curl -X PUT http://127.0.0.1:8080/api/projects/PROJECT_ID/sources/flight-computer \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Flight computer",
    "timeSystem": "gps",
    "timestampUnit": "milliseconds",
    "clockOffsetSeconds": 0.012,
    "clockDriftPpm": 0,
    "clockReferenceSourceSeconds": 0,
    "clockUncertaintyMs": 8,
    "expectedPeriodMs": 100
  }'`;
</script>

<svelte:head><title>{docTitle('Sources and clocks')}</title></svelte:head>

<PageHeader
	title="Sources and clocks"
	description="Source records describe the sender's clock and show when MCS last received its data."
/>

<article class="doc-page">
	<section>
		<h2>Routes</h2>
		<table>
			<thead><tr><th>Route</th><th>Use</th></tr></thead>
			<tbody>
				<tr><td><code>GET /api/projects/:id/sources</code></td><td>List sources and current status.</td></tr>
				<tr><td><code>GET /api/projects/:id/sources/:sourceId</code></td><td>Read one source record.</td></tr>
				<tr><td><code>PUT /api/projects/:id/sources/:sourceId</code></td><td>Create or update clock settings.</td></tr>
				<tr><td><code>GET /api/projects/:id/telemetry/metadata</code></td><td>Read provider capabilities and source stream metadata.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Configure a source clock</h2>
		<CodeBlock lang="bash" title="Set source clock settings" code={updateSource} />
		<p>Use <code>clockOffsetSeconds</code> for a fixed correction. <code>clockDriftPpm</code> applies a linear correction relative to <code>clockReferenceSourceSeconds</code>. Set <code>clockUncertaintyMs</code> and <code>expectedPeriodMs</code> when those estimates are known.</p>
		<p>The returned source record includes receive and event timestamps, sequence-gap counts, clock quality, and a freshness status. Freshness is based on the expected sample period with a 10 second minimum threshold.</p>
	</section>

	<section>
		<h2>Supported time systems</h2>
		<p>Versioned ingest accepts UTC and Unix UTC, GPS seconds from the GPS epoch, and Unix-aligned TAI. Other time systems need an explicit server-side adapter. MCS does not guess an unknown epoch.</p>
		<p>Every numeric timestamp in the provider API uses Unix UTC seconds. The original source timestamp and its declared unit remain attached to the sample.</p>
		<p>See <a href="/api/ingest">versioned ingest</a> and <a href="/api/telemetry">history queries</a>.</p>
	</section>
</article>
