<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Line plot')}</title></svelte:head>

<PageHeader
	title="Line plot"
	badge="Component"
	description="Plot timestamped numeric samples from one or more telemetry fields."
/>

<article class="doc-page">
	<section>
		<h2>Choose the series</h2>
		<p>Add a line plot from the object picker, then select the stream and numeric field for each series. The horizontal axis uses sample time. Each series can use its own stream.</p>
		<p>For continuous history, the chart requests a bounded time range from the project's telemetry provider. During run playback, it follows the shared replay playhead.</p>
	</section>

	<section>
		<h2>Read the chart</h2>
		<p>Compare trends and changes over time. Declare field units and expected ranges in the stream metadata so the plot can show useful labels and limits.</p>
		<Callout type="info" title="Sampling resolution">
			History queries can return raw samples or a bounded min/max series. Min/max retains the extrema in each time window for a numeric field.
		</Callout>
	</section>

	<section>
		<h2>Related pages</h2>
		<ul>
			<li><a href="/api/streams">Declare fields and limits</a></li>
			<li><a href="/api/telemetry">Query continuous history</a></li>
			<li><a href="/guides/runs">Record and replay a run</a></li>
		</ul>
	</section>
</article>
