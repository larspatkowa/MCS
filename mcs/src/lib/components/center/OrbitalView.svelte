<script lang="ts">
	import type { OrbitalViewProps } from '$lib/objects/types.js';
	import { getSampleGpsPoint, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { subscribeSSE, type SSEEvent } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';

	let { props } = $props<{ objectId: string; props: OrbitalViewProps }>();

	const gpsStreamId = $derived(props.gpsStreamId ?? 'sample:gps');
	const showTrail = $derived(props.showTrail ?? true);
	const trailColor = $derived(props.trailColor ?? '#4f9cf9');
	const showGrid = $derived(props.showGrid ?? true);
	const trailPoints = $derived(props.trailPoints ?? 500);
	const showOrbitPath = $derived(props.showOrbitPath ?? false);
	const inclination = $derived(props.inclination ?? 51.6);
	const period = $derived(props.period ?? 5400);

	let mapEl = $state<HTMLDivElement | null>(null);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstance: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let tileLayer: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let trailPolyline: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let posMarker: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let orbitPolylines: any[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let gridOverlayLines: any[] = [];

	let trail = $state<{ lat: number; lon: number; alt: number }[]>([]);
	let currentPos = $state<{ lat: number; lon: number; alt: number } | null>(null);

	function updatePosition(lat: number, lon: number, alt: number) {
		currentPos = { lat, lon, alt };
		if (showTrail) {
			trail = [...trail, { lat, lon, alt }].slice(-trailPoints);
		}
		updateMapMarkers();
	}

	async function initMap() {
		if (!mapEl || mapInstance) return;
		const L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		mapInstance = L.map(mapEl, {
			center: [20, 0],
			zoom: 2,
			minZoom: 2,
			maxZoom: 8,
			zoomControl: true,
			attributionControl: true,
			worldCopyJump: true
		});

		// Dark-themed tile layer for space/orbital aesthetic
		tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
			attribution:
				'© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
			maxZoom: 19,
			subdomains: 'abcd'
		}).addTo(mapInstance);

		// Draw optional lat/lon grid overlay
		if (showGrid) {
			drawGridLines(L);
		}

		if (showOrbitPath && currentPos) {
			drawOrbitPrediction(L);
		}

		updateMapMarkers();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function drawGridLines(L: any) {
		for (const line of gridOverlayLines) {
			if (mapInstance) mapInstance.removeLayer(line);
		}
		gridOverlayLines = [];

		const gridStyle = {
			color: 'rgba(255,255,255,0.08)',
			weight: 1,
			dashArray: '4 4',
			interactive: false
		};
		const eqStyle = { color: 'rgba(255,255,255,0.18)', weight: 1.5, interactive: false };

		// Latitude lines
		for (let lat = -60; lat <= 60; lat += 30) {
			const pts: [number, number][] = [];
			for (let lon = -180; lon <= 180; lon += 5) {
				pts.push([lat, lon]);
			}
			const line = L.polyline(pts, lat === 0 ? eqStyle : gridStyle).addTo(mapInstance);
			gridOverlayLines.push(line);
		}

		// Longitude lines
		for (let lon = -150; lon <= 180; lon += 30) {
			const pts: [number, number][] = [];
			for (let lat = -85; lat <= 85; lat += 5) {
				pts.push([lat, lon]);
			}
			const line = L.polyline(pts, lon === 0 ? eqStyle : gridStyle).addTo(mapInstance);
			gridOverlayLines.push(line);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function drawOrbitPrediction(L: any) {
		for (const line of orbitPolylines) {
			if (mapInstance) mapInstance.removeLayer(line);
		}
		orbitPolylines = [];

		if (!currentPos) return;
		const incRad = (inclination * Math.PI) / 180;
		const steps = 360;
		const segments: [number, number][][] = [[]];

		let lastLon = 0;
		for (let i = 0; i <= steps; i++) {
			const frac = i / steps;
			const angle = frac * 2 * Math.PI;
			const lat = Math.asin(Math.sin(incRad) * Math.sin(angle)) * (180 / Math.PI);
			const lonOffset =
				Math.atan2(Math.cos(incRad) * Math.sin(angle), Math.cos(angle)) * (180 / Math.PI);
			const lon = ((currentPos.lon + lonOffset + 540) % 360) - 180;

			if (i > 0 && Math.abs(lon - lastLon) > 180) {
				segments.push([]);
			}
			segments[segments.length - 1].push([lat, lon]);
			lastLon = lon;
		}

		for (const seg of segments) {
			if (seg.length > 1) {
				const line = L.polyline(seg, {
					color: trailColor,
					weight: 1.5,
					dashArray: '6 4',
					opacity: 0.35,
					interactive: false
				}).addTo(mapInstance);
				orbitPolylines.push(line);
			}
		}
	}

	async function updateMapMarkers() {
		if (!mapInstance) return;
		const L = await import('leaflet');

		// Update trail polyline
		if (showTrail && trail.length > 1) {
			const segments: [number, number][][] = [[]];
			let lastLon = trail[0].lon;
			for (const pt of trail) {
				if (Math.abs(pt.lon - lastLon) > 180) {
					segments.push([]);
				}
				segments[segments.length - 1].push([pt.lat, pt.lon]);
				lastLon = pt.lon;
			}

			if (trailPolyline) {
				mapInstance.removeLayer(trailPolyline);
			}
			const lines = segments
				.filter((seg) => seg.length > 1)
				.map((seg) =>
					L.polyline(seg, {
						color: trailColor,
						weight: 2.5,
						opacity: 0.8,
						lineCap: 'round',
						lineJoin: 'round'
					})
				);
			if (lines.length > 0) {
				trailPolyline = L.featureGroup(lines).addTo(mapInstance);
			}
		}

		// Update position marker
		if (currentPos) {
			const markerIcon = L.divIcon({
				className: '',
				html: `<div style="
					width: 16px; height: 16px;
					background: ${trailColor};
					border: 2.5px solid #fff;
					border-radius: 50%;
					box-shadow: 0 0 0 4px ${trailColor}44, 0 0 12px ${trailColor}88;
				"></div>`,
				iconSize: [16, 16],
				iconAnchor: [8, 8]
			});

			const popupContent = `<div style="font-family:monospace;font-size:11px;line-height:1.5;min-width:120px">
				<strong style="color:${trailColor}">● Satellite Position</strong><br/>
				<span style="color:#888">Lat:</span> ${currentPos.lat.toFixed(4)}°<br/>
				<span style="color:#888">Lon:</span> ${currentPos.lon.toFixed(4)}°<br/>
				${currentPos.alt > 0 ? `<span style="color:#888">Alt:</span> ${(currentPos.alt / 1000).toFixed(1)} km<br/>` : ''}
			</div>`;

			if (posMarker) {
				posMarker.setLatLng([currentPos.lat, currentPos.lon]);
				posMarker.setPopupContent(popupContent);
			} else {
				posMarker = L.marker([currentPos.lat, currentPos.lon], { icon: markerIcon })
					.bindPopup(popupContent, { className: 'mcs-orbital-popup' })
					.addTo(mapInstance);
			}

			if (showOrbitPath) {
				drawOrbitPrediction(L);
			}
		}
	}

	// SSE + sample data subscription
	$effect(() => {
		const isSample = isSampleStreamId(gpsStreamId);
		const proj = $currentProject;

		if (isSample) {
			function tick() {
				const now = Date.now() / 1000;
				const pt = getSampleGpsPoint(now);
				updatePosition(pt.lat, pt.lon, pt.alt);
			}
			tick();
			const iv = setInterval(tick, 1000);
			return () => clearInterval(iv);
		} else if (proj) {
			const unsub = subscribeSSE(proj.id, gpsStreamId, (event: SSEEvent) => {
				if ('values' in event) {
					const lat = Number(event.values.lat ?? event.values.latitude ?? 0);
					const lon = Number(event.values.lon ?? event.values.longitude ?? 0);
					const alt = Number(event.values.alt ?? event.values.altitude ?? 0);
					updatePosition(lat, lon, alt);
				}
			});
			return unsub;
		}
	});

	// Initialize map when element is available
	$effect(() => {
		if (mapEl) initMap();
		return () => {
			if (mapInstance) {
				mapInstance.remove();
				mapInstance = null;
				tileLayer = null;
				trailPolyline = null;
				posMarker = null;
				orbitPolylines = [];
				gridOverlayLines = [];
			}
		};
	});
</script>

<div class="orbital-root">
	<div class="map-container" bind:this={mapEl}></div>

	{#if currentPos}
		<div class="telemetry-overlay">
			<div class="telem-row">
				<span class="telem-label">Lat</span>
				<span class="telem-val">{currentPos.lat.toFixed(4)}°</span>
			</div>
			<div class="telem-row">
				<span class="telem-label">Lon</span>
				<span class="telem-val">{currentPos.lon.toFixed(4)}°</span>
			</div>
			{#if currentPos.alt > 0}
				<div class="telem-row">
					<span class="telem-label">Alt</span>
					<span class="telem-val">{(currentPos.alt / 1000).toFixed(1)} km</span>
				</div>
			{/if}
			{#if trail.length > 1}
				<div class="telem-row">
					<span class="telem-label">Pts</span>
					<span class="telem-val">{trail.length}</span>
				</div>
			{/if}
		</div>
	{/if}

	<div class="mode-badge">Orbital Track</div>
</div>

<style>
	.orbital-root {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #0a0e1a;
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	:global(.leaflet-container) {
		background: #0a0e1a;
		font-family: var(--mcs-font-sans);
	}

	:global(.leaflet-control-attribution) {
		font-size: 9px;
		background: rgba(0, 0, 0, 0.6) !important;
		color: rgba(255, 255, 255, 0.4) !important;
		backdrop-filter: blur(4px);
	}

	:global(.leaflet-control-attribution a) {
		color: rgba(255, 255, 255, 0.5) !important;
	}

	:global(.leaflet-control-zoom a) {
		background: rgba(10, 14, 26, 0.85) !important;
		color: rgba(255, 255, 255, 0.7) !important;
		border-color: rgba(255, 255, 255, 0.1) !important;
	}

	:global(.mcs-orbital-popup .leaflet-popup-content-wrapper) {
		background: rgba(10, 14, 26, 0.9);
		color: #e0e8f0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
	}
	:global(.mcs-orbital-popup .leaflet-popup-tip) {
		background: rgba(10, 14, 26, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.telemetry-overlay {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 1000;
		background: color-mix(in oklab, var(--mcs-surface) 76%, transparent);
		backdrop-filter: blur(10px);
		border: 1px solid color-mix(in oklab, var(--mcs-border) 70%, transparent);
		border-radius: 2px;
		padding: 6px 10px;
		font-family: var(--mcs-font-sans);
		pointer-events: none;
	}

	.telem-row {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		padding: 2px 0;
	}

	.telem-label {
		font-size: 11px;
		color: color-mix(in oklab, var(--mcs-text) 62%, transparent);
	}

	.telem-val {
		font-family: var(--mcs-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono');
		font-size: 11px;
		color: var(--mcs-text);
		font-variant-numeric: tabular-nums;
	}

	.mode-badge {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		font-family: var(--mcs-font-sans);
		font-size: 10px;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(10, 14, 26, 0.6);
		backdrop-filter: blur(6px);
		padding: 2px 10px;
		border-radius: 10px;
		pointer-events: none;
		letter-spacing: 0.5px;
	}
</style>
