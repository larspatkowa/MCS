<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const exampleGpsTrack = `{
  "type": "map-view",
  "name": "Ground track",
  "props": {
    "gpsStreamId": "rocket:gps",
    "baseLayer": "satellite",
    "zoom": 4,
    "centerLat": 28.57,
    "centerLon": -80.65,
    "showGpsTrail": true,
    "trailColor": "#4f9cf9",
    "trailWindowSec": 600,
    "trailMaxPoints": 600,
    "showMarker": true,
    "showInspector": true,
    "autoFollow": true
  }
}`;

	const exampleRasterOverlay = `{
  "type": "map-view",
  "name": "Field NDVI overlay",
  "props": {
    "baseLayer": "satellite",
    "showBaseLayer": true,
    "baseLayerOpacity": 1,
    "zoom": 16,
    "centerLat": 41.986684,
    "centerLon": -93.668541,
    "overlayImageUrl": "/assets/agri/ndvi-s2-bbox.png",
    "overlayLabel": "NDVI",
    "showOverlay": true,
    "overlayLegendMinLabel": "0.00",
    "overlayLegendMaxLabel": "1.00",
    "overlayOpacity": 0.8,
    "overlayBlendMode": "multiply",
    "overlaySouth": 41.979554,
    "overlayWest": -93.678317,
    "overlayNorth": 41.993814,
    "overlayEast": -93.658764,
    "showWaypointPath": true,
    "waypointPathColor": "#94a3b8",
    "showWaypointLabels": false
  }
}`;
</script>

<svelte:head>
	<title>{docTitle('Map View')}</title>
</svelte:head>

<PageHeader
	title="Map View"
	badge="Component"
	description="Leaflet-backed GPS track visualization with optional raster overlays and planned waypoints."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			Map View renders a slippy map (street, satellite, or topo), then layers on a live GPS trail, current
			position marker, optional path inspection, and optional waypoint route planning.
		</p>
		<Callout type="tip" title="Quick preview">
			Use <code>/gallery/map-view/gps-track</code> for a stable sample GPS track without creating a project.
		</Callout>
	</section>

	<section>
		<h2>Overlay legend</h2>
		<p>
			If you provide <code>overlayImageUrl</code> + overlay bounds, Map View shows a compact legend strip
			(square corners, theme border): a low–high ramp plus labels. The ramp is UI-only; raster colors come
			from <code>overlayImageUrl</code>. For generating a real NDVI overlay PNG, see
			<code>mcs/scripts/fetch-s2-ndvi.mjs</code>.
		</p>
		<p>
			To manually configure the legend strip, set <code>overlayLegendRampCss</code>,
			<code>overlayLegendMinLabel</code>, and <code>overlayLegendMaxLabel</code>.
		</p>
	</section>

	<section>
		<h2>Example: GPS ground track</h2>
		<CodeBlock lang="json" title="Object JSON (GPS track)" code={exampleGpsTrack} />
		<p>
			Note: stream sample timestamps are interpreted as <strong>seconds since epoch</strong> (matching the
			API and SSE event format).
		</p>
	</section>

	<section>
		<h2>Example: raster overlay (NDVI)</h2>
		<CodeBlock lang="json" title="Object JSON (overlay)" code={exampleRasterOverlay} />
		<Callout type="info" title="Real NDVI overlay asset">
			The Agriculture demo can use a PNG computed from Sentinel-2 (10m) NDVI. Generate the file with
			<code>node mcs/scripts/fetch-s2-ndvi.mjs</code> (see script header for bbox/time env vars).
		</Callout>
	</section>
</article>

