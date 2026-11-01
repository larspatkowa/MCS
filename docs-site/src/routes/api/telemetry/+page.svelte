<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const history = `curl 'http://127.0.0.1:8080/api/projects/PROJECT_ID/telemetry/history?sourceId=flight-computer&streamId=navigation%3Aaltitude&from=1786137600&to=1786137700&resolution=minmax&field=altitude&maxSamples=2000'`;
</script>

<svelte:head><title>{docTitle('Telemetry history')}</title></svelte:head>

<PageHeader
	title="Telemetry history"
	description="The history API returns bounded pages for one source, stream, and time range."
/>

<article class="doc-page">
	<section>
		<h2>Check provider capabilities</h2>
		<p><code>GET /api/projects/:id/telemetry/metadata</code> returns the provider ID, supported capabilities, and source stream metadata. The SQLite provider supports live updates, history, resumable events, and raw, latest, and min/max resolutions.</p>
	</section>

	<section>
		<h2>Query a time range</h2>
		<CodeBlock lang="bash" title="Bounded min/max query" code={history} />
		<p>Both <code>from</code> and <code>to</code> are required Unix UTC seconds, and <code>to</code> must be greater than <code>from</code>. Set <code>maxSamples</code> to cap each response page. It defaults to 2,000 and accepts values from 1 to 10,000.</p>
	</section>

	<section>
		<h2>Choose a resolution</h2>
		<table>
			<thead><tr><th>Resolution</th><th>Result</th></tr></thead>
			<tbody>
				<tr><td><code>raw</code></td><td>Return stored samples in pages. Use <code>nextPageCursor</code> to continue.</td></tr>
				<tr><td><code>latest</code></td><td>Return the newest sample in the requested interval. Cursor paging is not supported.</td></tr>
				<tr><td><code>minmax</code></td><td>Reduce a numeric field to per-window extrema. Set <code>field</code> to the value key.</td></tr>
			</tbody>
		</table>
		<Callout type="info" title="Cursors belong to a query">
			Pass the opaque cursor back with the same source, stream, bounds, and resolution. Keep the original time range while reading later pages.
		</Callout>
	</section>

	<section>
		<h2>History retention</h2>
		<p>Continuous history defaults to 30 days. Set project retention from 1 to 3,650 days. Saved run retention is managed separately.</p>
		<p>See <a href="/configuration">configuration</a> and <a href="/api/sources">source metadata</a>.</p>
	</section>
</article>
