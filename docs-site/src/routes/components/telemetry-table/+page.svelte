<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Telemetry table')}</title></svelte:head>

<PageHeader
	title="Telemetry table"
	badge="Component"
	description="Show current values from configured telemetry streams in a compact table."
/>

<article class="doc-page">
	<section>
		<h2>Configure the table</h2>
		<p>Add a telemetry table and choose the streams and fields to display. Use stream metadata to give fields readable names and units. The table reads the same stream data used by plots and gauges.</p>
	</section>

	<section>
		<h2>Live and historical data</h2>
		<p>In live mode, incoming samples update the displayed values. While a run is loaded, the table reads values at the shared replay time. It can be placed inside either a grid layout or a flex layout.</p>
	</section>

	<section>
		<h2>Related pages</h2>
		<ul>
			<li><a href="/api/streams">Stream fields and units</a></li>
			<li><a href="/components/grid-layout">Grid layout</a></li>
			<li><a href="/components/flex-layout">Flex layout</a></li>
		</ul>
	</section>
</article>
