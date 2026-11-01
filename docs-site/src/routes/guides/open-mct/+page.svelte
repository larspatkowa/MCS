<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	type Row = [area: string, openmct: string, mcs: string];
	const rows: Row[] = [
		['Scope', 'Browser framework; you write the telemetry server and persistence', 'Complete ground station: ingest, storage, history, UI'],
		['Telemetry ingest', 'None built in', 'HTTP single, batch and versioned envelopes; idempotent retries; sequence gap tracking'],
		['Storage', 'Bring your own historian; CouchDB for objects', 'SQLite per project (WAL), retention, backup and restore'],
		['Time', 'Time conductor (fixed and realtime)', 'Time conductor, source clocks (UTC, GPS, TAI) with offset and uncertainty'],
		['Plots', 'Overlay, stacked, scatter, bar', 'Overlay with a second unit axis, stacked through Stack, scatter; no bar graph'],
		['Tables', 'Telemetry table, LAD table', 'Telemetry table, Values table with limits, units and staleness'],
		['Layouts', 'Display, flexible, tabs', 'Grid, flex, tabs, stack'],
		['Limits and alarms', 'Limit evaluation from your provider; fault management plugin', 'Server-side limits, alarm log with acknowledgement, alarm status in the status bar'],
		['Conditions', 'Condition sets and condition styling', 'Not built yet'],
		['Notebook', 'Notebook with snapshots', 'Operator notes in Alarms & Log and on the timeline; Markdown notes'],
		['Clocks', 'Clock and timer', 'Mission clock with T−/T+, hold and recycle, shared across operators'],
		['Imagery', 'Imagery view', 'Image and video bound to runs, rendered exports'],
		['Maps', 'Plugin', 'Ground track with range and bearing from the pad, works offline'],
		['Plans and timelines', 'Plan view, time strip', 'Timeline strip of annotations and alarms; no plan import'],
		['Recording and replay', 'Depends on your historian', 'Runs: record, pause, export, import, replay on one clock'],
		['Access control', 'Not built in', 'Accounts, project roles, scoped API tokens, audit log'],
		['Agents', 'None', 'MCP server with read, alarm, recording and display tools'],
		['Plugin API', 'Extensive', 'None; extend through the HTTP API']
	];
</script>

<svelte:head><title>{docTitle('Compared with Open MCT')}</title></svelte:head>

<PageHeader
	title="Compared with Open MCT"
	description="Where MCS matches Open MCT, where it goes further, and what it does not have yet."
/>

<article class="doc-page">
	<section>
		<p>
			Open MCT is a frontend framework. A team using it still writes and runs the server that
			receives telemetry, stores history and keeps object definitions. MCS ships that whole stack
			as one process. In exchange it has fewer views and no plugin system.
		</p>
		<table>
			<thead><tr><th>Area</th><th>Open MCT</th><th>MCS</th></tr></thead>
			<tbody>
				{#each rows as [area, openmct, mcs] (area)}
					<tr><td>{area}</td><td>{openmct}</td><td>{mcs}</td></tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2>Logging rate</h2>
		<p>
			On an Apple M1 Pro laptop with one local client, the production build accepted about 3,900
			single-sample requests per second and about 80,000 samples per second in batches of 1,000.
			The server stayed mostly idle in the batch test, so the client was the limit. A typical
			hobby or university flight computer sends tens to hundreds of samples per second.
		</p>
		<Callout type="info" title="Batch when you can">
			One request per sample spends most of its time on HTTP. A radio bridge that buffers 50 to
			200 ms of samples and posts them to <code>/api/ingest/batch</code> uses far less CPU.
		</Callout>
	</section>

	<section>
		<h2>Using both</h2>
		<p>
			MCS includes a read-only Open MCT telemetry provider in
			<code>mcs/examples/openmct</code>. A team can keep an existing Open MCT display and use MCS
			as its historian and realtime source.
		</p>
	</section>
</article>
