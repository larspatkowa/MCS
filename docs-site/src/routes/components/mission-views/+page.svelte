<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { docTitle } from '$lib/nav.js';

	const groundTrack = `{
  "type": "ground-track",
  "name": "Recovery",
  "props": {
    "dataSource": "vehicle:gps",
    "latField": "lat",
    "lonField": "lon",
    "altField": "alt",
    "padLat": 34.6152,
    "padLon": -86.6701
  }
}`;
	const plot = `{
  "type": "line-plot",
  "name": "Altitude and velocity",
  "props": { "dataSources": ["vehicle:state#alt", "vehicle:state#vel"] }
}`;
</script>

<svelte:head><title>{docTitle('Mission views')}</title></svelte:head>

<PageHeader
	title="Mission views"
	description="Views for flight operations: newest values, alarms, the mission clock, the ground track, scatter plots and containers."
/>

<article class="doc-page">
	<section>
		<h2>Values table</h2>
		<p>
			One row per field of each chosen stream, showing the newest value, unit, UTC time and age.
			Values outside the stream's limits are marked WARN or CRIT. Rows with no new sample within
			<code>staleAfterSec</code> are marked STALE. In history and replay the table shows the
			values in force at the playhead.
		</p>
	</section>

	<section>
		<h2>Alarms &amp; Log</h2>
		<p>
			Limit violations arrive as they happen and can be acknowledged one by one or all at once.
			Operators can log a note at the current time; notes are stored with the active run and appear
			on the timeline. The status bar shows the number of open alarms from every view.
		</p>
	</section>

	<section>
		<h2>Mission clock</h2>
		<p>
			Counts T− to a launch time and T+ after it. Start a count from a number of minutes, mark
			T-0 now, hold, resume, or recycle. The count is stored in the project, so every operator sees
			the same clock.
		</p>
	</section>

	<section>
		<h2>Ground track</h2>
		<p>
			Draws GPS fixes around the launch site with range rings, and shows range and bearing from the
			pad, maximum range and altitude. It needs no map tiles, so it works at a field without
			internet. <strong>Copy</strong> puts the newest fix on the clipboard for recovery.
		</p>
		<CodeBlock lang="json" title="Ground track" code={groundTrack} />
	</section>

	<section>
		<h2>Scatter plot</h2>
		<p>
			Plots one field against another, such as velocity against altitude. The fields can come from
			one stream or from two streams; the Y value in force at each X sample is used.
		</p>
	</section>

	<section>
		<h2>Plotting fields of one stream</h2>
		<p>
			When a packet carries several values, add each field to a line plot as
			<code>stream#field</code>. The property panel lists the fields declared in the stream's
			<code>units</code> metadata. Series with different units get a second axis.
		</p>
		<CodeBlock lang="json" title="Two fields of one stream" code={plot} />
	</section>

	<section>
		<h2>Tabs, Stack and Web page</h2>
		<p>
			<strong>Tabs</strong> shows one child at a time. <strong>Stack</strong> shows children in
			rows that share the time conductor, which gives stacked plots aligned in time.
			<strong>Web page</strong> embeds an http or https page in a sandbox with no access to MCS.
		</p>
	</section>
</article>
