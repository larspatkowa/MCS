<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const groups = [
		{
			name: 'Containers',
			items: [
				['folder', 'Groups objects in the sidebar tree.'],
				['stack', 'Tabbed container for switching between child objects.'],
				['grid-layout', 'Fixed-position dashboard grid.'],
				['flex-layout', 'Resizable split panes.']
			]
		},
		{
			name: 'Charts',
			items: [
				['line-plot', 'Single or multi-series time plots.'],
				['bar-chart', 'Bucketed scalar comparison.'],
				['scatter-plot', 'Point correlation view.'],
				['overlay-plot', 'Mixed line/scatter overlay with dual axes.'],
				['stacked-plot', 'Aligned multi-row traces.'],
				['function-plot', 'Generated math expression over time.'],
				['polar-plot', 'Polar or radar-style plotting.'],
				['plot-3d', '3-axis scatter view.']
			]
		},
		{
			name: 'Visualization',
			items: [
				['map-view', 'Leaflet-backed GPS and overlay map.'],
				['orbital-view', 'Ground-track view for orbital telemetry.']
			]
		},
		{
			name: 'Instruments',
			items: [
				['gauge', 'Linear or dial gauge for a single stream.'],
				['clock', 'Mission clock or local time display.']
			]
		},
		{
			name: 'Data',
			items: [
				['telemetry-table', 'Tabular stream readout.'],
				['gantt-chart', 'Task timeline view with a Now jump link and a current-time marker.'],
				['notebook', 'Structured note entries.'],
				['condition-set', 'Rule-driven status display.'],
				['summary-widget', 'Compact state banner or indicator.']
			]
		},
		{
			name: 'Content',
			items: [
				['hyperlink', 'External link launcher.'],
				['iframe-embed', 'Embedded page or app.'],
				['markdown-note', 'Markdown document inside the project tree.']
			]
		},
		{
			name: 'Media',
			items: [
				['camera-feed', 'Browser camera preview.'],
				['mic-audio', 'Live microphone spectrum or waveform.']
			]
		}
	];
</script>

<svelte:head>
	<title>{docTitle('Components')}</title>
</svelte:head>

<PageHeader
	title="Components"
	description="These are the object types currently shown in Add Object. The list matches the built-in bootstrap."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			Use <code>/gallery</code> when you want quick previews; it uses the same center column and
			flat sidebar chrome as an open project, not a separate marketing layout. This page stays close
			to the source so the list does not drift from the app.
		</p>
		<Callout type="info" title="Scope">
			This page tracks the types exposed in <code>mcs/src/lib/object-types/bootstrap.ts</code>. It
			does not try to cover every internal union member or legacy helper.
		</Callout>
		<p>
			For the path from example project to custom type registration, see
			<a href="/tutorials/example-projects">Example projects</a>.
		</p>
	</section>

	{#each groups as group}
		<section>
			<h2>{group.name}</h2>
			<table>
				<thead>
					<tr><th>Type id</th><th>Use</th></tr>
				</thead>
				<tbody>
					{#each group.items as [typeId, description]}
						<tr>
							<td>
								{#if typeId === 'gauge'}
									<a href="/components/gauge"><code>{typeId}</code></a>
								{:else if typeId === 'grid-layout'}
									<a href="/components/grid-layout"><code>{typeId}</code></a>
								{:else if typeId === 'flex-layout'}
									<a href="/components/flex-layout"><code>{typeId}</code></a>
								{:else if typeId === 'map-view'}
									<a href="/components/map-view"><code>{typeId}</code></a>
								{:else if typeId === 'summary-widget'}
									<a href="/components/summary-widget"><code>{typeId}</code></a>
								{:else}
									<code>{typeId}</code>
								{/if}
							</td>
							<td>{description}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/each}
</article>
