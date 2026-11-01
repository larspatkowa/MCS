<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Core concepts')}</title></svelte:head>

<PageHeader
	title="Core concepts"
	description="MCS keeps project structure, telemetry streams, source clocks, and saved runs separate so each has a clear job."
/>

<article class="doc-page">
	<section>
		<h2>Projects and objects</h2>
		<p>A project is a directory with a manifest and a SQLite database. It holds the object tree, stream definitions, telemetry, annotations, runs, media, and render output for one workspace.</p>
		<p>Objects are the folders, layouts, plots, gauges, tables, notes, and media views inside that project. The project root is an object too. Objects describe what MCS should display; they do not own the source data.</p>
		<p>Start with <a href="/configuration">project files</a> or browse the <a href="/components">built-in object types</a>.</p>
	</section>

	<section>
		<h2>Streams and samples</h2>
		<p>A stream is a named channel such as <code>sensor:temperature</code>. Each sample has a timestamp and a JSON object of values. A stream can describe field names, units, ranges, and limit thresholds.</p>
		<p>Use <a href="/api/ingest">ingest</a> to send samples and <a href="/api/streams">stream declarations</a> to add metadata.</p>
	</section>

	<section>
		<h2>Sources and event time</h2>
		<p>A source identifies the system that produced a sample. Versioned ingest records its original timestamp, unit, time system, quality, and provenance alongside the normalized UTC event time. The receive time remains separate.</p>
		<p>MCS can convert Unix UTC, GPS, and Unix-aligned TAI. A source-specific offset or drift correction can adjust the conversion. The system that captures the data remains responsible for its clock discipline.</p>
		<p>See <a href="/api/sources">sources and clocks</a> for configuration fields.</p>
	</section>

	<section>
		<h2>Continuous history and runs</h2>
		<p>Continuous history stores incoming samples in SQLite for a configurable number of days. A run is a named recording with its own start and end. Use history for recent or long-running trends; use runs when you need a bounded recording to replay, package, or share.</p>
		<p>Both use the same stored sample times. Replay gives the project displays one shared playhead, so plots, tables, gauges, layouts, and video stay in step.</p>
		<p>See <a href="/api/telemetry">history queries</a> and <a href="/guides/runs">recording and replay</a>.</p>
	</section>

	<section>
		<h2>What MCS owns</h2>
		<p>Acquisition systems own sensors, calibration, raw recording, and clock discipline. They send normalized samples or import a run package. MCS validates and stores those inputs, serves them to views, and handles replay and export.</p>
		<p>MCS does not issue commands to a vehicle or device.</p>
	</section>
</article>
