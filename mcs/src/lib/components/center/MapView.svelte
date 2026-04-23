<script lang="ts">
	import type { MapViewProps, MapWaypoint } from '$lib/objects/types.js';
	import { untrack } from 'svelte';
	import { getSampleGpsSeries } from '$lib/charts/sample-streams.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: MapViewProps }>();

	const DEFAULT_CENTER_LAT = 28.5729;
	const DEFAULT_CENTER_LON = -80.649;

	function normalizeZoom(value: number | undefined): number {
		return Math.max(2, Math.min(18, Math.round(value ?? 13)));
	}

	function normalizeCenterLat(value: number | undefined): number {
		return Number.isFinite(value) ? Number(value) : DEFAULT_CENTER_LAT;
	}

	function normalizeCenterLon(value: number | undefined): number {
		return Number.isFinite(value) ? Number(value) : DEFAULT_CENTER_LON;
	}

	const baseLayer = $derived(props.baseLayer ?? 'osm');
	const showBaseLayer = $derived(props.showBaseLayer !== false);
	const baseLayerOpacity = $derived(Math.max(0, Math.min(1, props.baseLayerOpacity ?? 1)));
	const initZoom = $derived(normalizeZoom(props.zoom));
	const savedCenterLat = $derived(normalizeCenterLat(props.centerLat));
	const savedCenterLon = $derived(normalizeCenterLon(props.centerLon));
	const showGpsTrail = $derived(props.showGpsTrail !== false);
	const showMarker = $derived(props.showMarker !== false);
	const trailColor = $derived(props.trailColor ?? '#4f9cf9');
	const trailWindowSec = $derived(props.trailWindowSec ?? 300);
	const trailMaxPoints = $derived(props.trailMaxPoints ?? 500);
	const pollInterval = $derived(props.pollInterval ?? 5000);
	const showInspector = $derived(props.showInspector !== false);
	const autoFollow = $derived(props.autoFollow === true);
	const overlayImageUrl = $derived(props.overlayImageUrl?.trim() ?? '');
	const overlayImageUrlFallback = $derived((props as MapViewProps & { overlayImageUrlFallback?: string }).overlayImageUrlFallback?.trim() ?? '');
	const overlayOpacity = $derived(Math.max(0, Math.min(1, props.overlayOpacity ?? 0.72)));
	const overlayLabel = $derived(props.overlayLabel?.trim() ?? '');
	const showOverlay = $derived(props.showOverlay !== false);
	const overlayBlendMode = $derived(props.overlayBlendMode ?? 'multiply');
	const overlayBounds = $derived.by(() => {
		const south = Number(props.overlaySouth);
		const west = Number(props.overlayWest);
		const north = Number(props.overlayNorth);
		const east = Number(props.overlayEast);
		if ([south, west, north, east].some((value) => !Number.isFinite(value))) return null;
		return [
			[south, west],
			[north, east]
		] as [[number, number], [number, number]];
	});
	const showWaypointPath = $derived(props.showWaypointPath !== false);
	const waypointPathColor = $derived(props.waypointPathColor ?? '#f59e0b');
	const waypointPathOpacity = $derived(Math.max(0, Math.min(1, props.waypointPathOpacity ?? 0.9)));
	const showWaypointLabels = $derived(props.showWaypointLabels === true);
	const waypoints = $derived(
		Array.isArray(props.waypoints) ? props.waypoints.filter(isValidWaypoint) : []
	);
	const hasOverlay = $derived(Boolean(overlayImageUrl && overlayBounds));
	let effectiveOverlayUrl = $state<string>('');

	$effect(() => {
		// Resolve overlay URL to something that actually exists.
		// This keeps the demo working even if the generated PNG isn't checked in.
		const primary = overlayImageUrl;
		const fallback = overlayImageUrlFallback;
		effectiveOverlayUrl = primary;
		if (!primary || !fallback) return;
		let cancelled = false;
		fetch(primary, { method: 'HEAD' })
			.then((r) => {
				if (cancelled) return;
				if (!r.ok) effectiveOverlayUrl = fallback;
			})
			.catch(() => {
				if (!cancelled) effectiveOverlayUrl = fallback;
			});
		return () => {
			cancelled = true;
		};
	});

	let currentTileLayerKey = $state<'osm' | 'satellite' | 'topographic' | null>(null);
	const overlayLegendLabels = $derived.by(() => {
		const min = (props.overlayLegendMinLabel ?? '').trim();
		const max = (props.overlayLegendMaxLabel ?? '').trim();
		if (min || max) {
			return { low: min || 'low', high: max || 'high' };
		}
		const label = overlayLabel.toLowerCase();
		if (label.includes('ndvi')) {
			return { low: '0.00', high: '1.00' };
		}
		return { low: 'low', high: 'high' };
	});
	const overlayLegendRamp = $derived.by(() => {
		const custom = (props.overlayLegendRampCss ?? '').trim();
		if (custom) return custom;
		const label = overlayLabel.toLowerCase();
		if (label.includes('ndvi')) {
			return 'linear-gradient(90deg, #7a3a24 0%, #b05a2e 22%, #e29a3e 44%, #d8c349 60%, #7dbe52 78%, #2b7d3c 100%)';
		}
		return null;
	});
	// gpsStreamId: use provided stream, or 'sample:gps' as fallback
	const gpsStreamId = $derived(props.gpsStreamId ?? '');
	const useLiveStream = $derived(!!gpsStreamId && gpsStreamId !== 'sample:gps');

	// Live GPS buffer for SSE stream
	let liveGpsBuffer = $state<
		{ lat: number; lon: number; alt?: number; speed?: number; time?: number }[]
	>([]);
	let lastLiveGpsTime = $state(0);

	function toGpsPoint(
		value: Record<string, unknown>,
		time: number
	): { lat: number; lon: number; alt?: number; speed?: number; time?: number } | null {
		const lat = Number(value.lat);
		const lon = Number(value.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
		return {
			lat,
			lon,
			alt: value.alt !== undefined ? Number(value.alt) : undefined,
			speed: value.speed !== undefined ? Number(value.speed) : undefined,
			time
		};
	}

	function trimLiveGpsBuffer(
		points: { lat: number; lon: number; alt?: number; speed?: number; time?: number }[]
	) {
		// All stream timestamps are seconds since epoch (consistent with SSE events and API samples).
		const cutoff = Date.now() / 1000 - trailWindowSec;
		return [...points]
			.filter((point) => (point.time ?? 0) >= cutoff)
			.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
			.slice(-trailMaxPoints);
	}

	$effect(() => {
		if (!useLiveStream) {
			liveGpsBuffer = [];
			return;
		}
		const proj = $currentProject;
		if (!proj) return;
		let cancelled = false;
		const nowSec = Date.now() / 1000;
		const from = nowSec - trailWindowSec;
		const load = fetch(
					`/api/projects/${proj.id}/streams/${encodeURIComponent(gpsStreamId)}/samples?start=${from}&end=${nowSec}&limit=${trailMaxPoints}`
				).then((response) => (response.ok ? response.json() : null));
		load.then(
			(payload: { data?: Array<Record<string, unknown> & { timestamp?: number }> } | null) => {
					if (cancelled || !payload?.data) return;
					const points = payload.data
						.map((sample) => toGpsPoint(sample, Number(sample.timestamp ?? nowSec)))
						.filter(
							(
								point
							): point is {
								lat: number;
								lon: number;
								alt?: number;
								speed?: number;
								time?: number;
							} => point != null
						);
					liveGpsBuffer = trimLiveGpsBuffer(points);
					lastLiveGpsTime = liveGpsBuffer[liveGpsBuffer.length - 1]?.time ?? 0;
					updateLiveTrail(false);
					rebuildRevealFromBuffer();
			}
		).catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	// SSE subscription for live GPS
	$effect(() => {
		if (!useLiveStream) return;
		const proj = $currentProject;
		if (!proj) return;
		const unsub = subscribeSSE(proj.id, gpsStreamId, (event) => {
			if ('values' in event) {
				const point = toGpsPoint(event.values as Record<string, unknown>, event.timestamp);
				if (!point) return;
				if ((point.time ?? 0) <= lastLiveGpsTime) return;
				lastLiveGpsTime = point.time ?? lastLiveGpsTime;
				liveGpsBuffer = trimLiveGpsBuffer([...liveGpsBuffer, point]);
				(revealOverlayLayer as any)?.__mcsReveal?.addRevealPoint?.(point.lat, point.lon, point.time ?? 0);
				updateLiveTrail();
			}
		});
		return unsub;
	});

	let mapEl = $state<HTMLDivElement | null>(null);
	let inspectData = $state<{
		lat: number;
		lon: number;
		alt?: number;
		speed?: number;
		time?: string;
		idx: number;
	} | null>(null);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mapInstance: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let tileLayer: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let trailPolyline: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let posMarker: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let inspectMarker: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let imageOverlay: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let revealOverlayLayer: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let waypointLayer: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let waypointPath: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let trailDots: any[] = [];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let lastGpsData = $state<
		{ lat: number; lon: number; alt?: number; speed?: number; time?: number }[]
	>([]);
	let viewPersistTimer: ReturnType<typeof setTimeout> | null = null;
	let invalidateSizeFrame = 0;
	let suppressNextViewportSync = false;
	let lastPersistedView = $state<{ centerLat: number; centerLon: number; zoom: number } | null>(
		null
	);

	const tileSources: Record<string, { url: string; attribution: string; maxZoom: number }> = {
		osm: {
			url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
			maxZoom: 19
		},
		satellite: {
			url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			attribution: '© <a href="https://www.esri.com">Esri</a>',
			maxZoom: 18
		},
		topographic: {
			url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
			attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a>',
			maxZoom: 17
		}
	};

	function buildTileLayer(L: typeof import('leaflet')) {
		const src = tileSources[baseLayer] ?? tileSources.osm;
		return L.tileLayer(src.url, {
			attribution: src.attribution,
			maxZoom: src.maxZoom,
			updateWhenIdle: false,
			keepBuffer: 12
		});
	}

	async function initMap() {
		if (!mapEl || mapInstance) return;

		const L = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		mapInstance = L.map(mapEl, {
			center: [savedCenterLat, savedCenterLon],
			zoom: initZoom,
			zoomControl: true,
			attributionControl: true,
			zoomSnap: 1,
			zoomDelta: 1,
			fadeAnimation: false,
			markerZoomAnimation: false
		});
		mapInstance.on('moveend zoomend', handleViewportChanged);

		await syncBaseLayer(L);

		syncOverlay(L);
		syncWaypoints(L);

		if (showGpsTrail) {
			updateTrail(L);
		}

		scheduleInvalidateSize();
	}

	function getMapView() {
		if (!mapInstance) return null;
		const center = mapInstance.getCenter?.();
		if (!center) return null;
		return {
			centerLat: Number(center.lat.toFixed(6)),
			centerLon: Number(center.lng.toFixed(6)),
			zoom: normalizeZoom(mapInstance.getZoom?.())
		};
	}

	function sameView(
		a: { centerLat: number; centerLon: number; zoom: number } | null,
		b: { centerLat: number; centerLon: number; zoom: number } | null
	): boolean {
		if (!a || !b) return false;
		return (
			Math.abs(a.centerLat - b.centerLat) < 0.000001 &&
			Math.abs(a.centerLon - b.centerLon) < 0.000001 &&
			a.zoom === b.zoom
		);
	}

	function schedulePersistView() {
		const proj = $currentProject;
		const view = getMapView();
		if (!proj || !view || proj.id === 'gallery') return;
		if (false) return;
		const propView = {
			centerLat: savedCenterLat,
			centerLon: savedCenterLon,
			zoom: initZoom
		};
		if (sameView(view, propView) || sameView(view, lastPersistedView)) return;
		lastPersistedView = view;
		if (viewPersistTimer) clearTimeout(viewPersistTimer);
		viewPersistTimer = setTimeout(() => {
			const nextProps = {
				...props,
				centerLat: view.centerLat,
				centerLon: view.centerLon,
				zoom: view.zoom
			};
			void fetch(`/api/projects/${proj.id}/objects/${objectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ props: nextProps })
			}).catch(() => {});
		}, 320);
	}

	function handleViewportChanged() {
		if (suppressNextViewportSync) {
			suppressNextViewportSync = false;
			return;
		}
		schedulePersistView();
	}

	function applySavedView(
		view: { centerLat: number; centerLon: number; zoom: number },
		animate = false
	) {
		if (!mapInstance) return;
		const current = getMapView();
		if (sameView(current, view)) return;
		suppressNextViewportSync = true;
		mapInstance.setView([view.centerLat, view.centerLon], view.zoom, { animate });
	}

	function isValidWaypoint(value: MapWaypoint | Record<string, unknown>): value is MapWaypoint {
		return Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lon));
	}

	function bringMissionLayersToFront() {
		trailPolyline?.bringToFront?.();
		waypointPath?.bringToFront?.();
		waypointLayer?.eachLayer?.((layer: { bringToFront?: () => void }) => layer.bringToFront?.());
		imageOverlay?.bringToFront?.();
		revealOverlayLayer?.bringToFront?.();
		posMarker?.bringToFront?.();
		inspectMarker?.bringToFront?.();
	}

	function applyOverlayStyling() {
		const element = imageOverlay?.getElement?.() as HTMLElement | null;
		if (!element) return;
		element.style.mixBlendMode = overlayBlendMode;
		element.style.opacity = String(overlayOpacity);
		pointerEventsNone(element);
	}

	function pointerEventsNone(element: HTMLElement) {
		element.style.pointerEvents = 'none';
	}

	function scheduleInvalidateSize() {
		if (!mapInstance) return;
		if (invalidateSizeFrame) cancelAnimationFrame(invalidateSizeFrame);
		invalidateSizeFrame = requestAnimationFrame(() => {
			invalidateSizeFrame = 0;
			mapInstance?.invalidateSize?.({ pan: false, animate: false });
			bringMissionLayersToFront();
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function syncOverlay(L?: any) {
		if (!mapInstance) return;
		const _L = L ?? (await import('leaflet'));

		if (imageOverlay) {
			mapInstance.removeLayer(imageOverlay);
			imageOverlay = null;
		}
		if (revealOverlayLayer) {
			mapInstance.removeLayer(revealOverlayLayer);
			revealOverlayLayer = null;
		}

		if (!effectiveOverlayUrl || !overlayBounds) return;
		const bounds = overlayBounds;
		if (!showOverlay) return;

		// NDVI sequential reveal mode: draw the overlay into a canvas and progressively
		// reveal it based on the live GPS trail.
		const wantsReveal = useLiveStream && overlayLabel.toLowerCase().includes('ndvi');
		if (!wantsReveal) {
			imageOverlay = _L.imageOverlay(effectiveOverlayUrl, bounds, {
				opacity: overlayOpacity,
				interactive: false
			});
			imageOverlay.on('load', applyOverlayStyling);
			imageOverlay.addTo(mapInstance);
			applyOverlayStyling();
			bringMissionLayersToFront();
			return;
		}

		revealOverlayLayer = _L.layerGroup().addTo(mapInstance);

		const canvas = _L.DomUtil.create('canvas', '') as HTMLCanvasElement;
		canvas.style.position = 'absolute';
		canvas.style.pointerEvents = 'none';
		canvas.style.mixBlendMode = overlayBlendMode;
		canvas.style.opacity = String(overlayOpacity);
		const ctx2d = canvas.getContext('2d');
		if (!ctx2d) return;
		const ctx = ctx2d;

		const img = new Image();
		img.crossOrigin = 'anonymous';

		let mask: HTMLCanvasElement | null = null;
		let maskCtx: CanvasRenderingContext2D | null = null;
		let lastPt: { x: number; y: number; t: number } | null = null;

		function latLonToPixel(lat: number, lon: number) {
			const south = bounds[0][0];
			const west = bounds[0][1];
			const north = bounds[1][0];
			const east = bounds[1][1];
			const fx = (lon - west) / (east - west || 1);
			const fy = (north - lat) / (north - south || 1);
			return { x: fx * img.naturalWidth, y: fy * img.naturalHeight };
		}

		function redraw() {
			if (!mask) return;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			ctx.globalCompositeOperation = 'destination-in';
			ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
			ctx.globalCompositeOperation = 'source-over';
		}

		function updateCanvasPosition() {
			if (!mapInstance) return;
			const nw = mapInstance.latLngToLayerPoint([bounds[1][0], bounds[0][1]]);
			const se = mapInstance.latLngToLayerPoint([bounds[0][0], bounds[1][1]]);
			const w = Math.max(1, Math.round(se.x - nw.x));
			const h = Math.max(1, Math.round(se.y - nw.y));
			canvas.width = w;
			canvas.height = h;
			canvas.style.left = `${nw.x}px`;
			canvas.style.top = `${nw.y}px`;
			redraw();
		}

		function resetReveal() {
			if (!maskCtx || !mask) return;
			maskCtx.clearRect(0, 0, mask.width, mask.height);
			lastPt = null;
			redraw();
		}

		function addRevealPoint(lat: number, lon: number, t: number) {
			if (!maskCtx || !mask) return;
			const p = latLonToPixel(lat, lon);
			if (lastPt && t < lastPt.t - 2) resetReveal();
			const swathPx = Math.max(10, Math.round(Math.min(mask.width, mask.height) * 0.035));
			maskCtx.strokeStyle = '#fff';
			maskCtx.lineWidth = swathPx;
			maskCtx.lineCap = 'square';
			maskCtx.lineJoin = 'round';
			const dt = lastPt ? Math.abs(t - lastPt.t) : 0;
			const dx = lastPt ? p.x - lastPt.x : 0;
			const dy = lastPt ? p.y - lastPt.y : 0;
			const jumpPx = lastPt ? Math.sqrt(dx * dx + dy * dy) : 0;
			const isJump = lastPt ? dt > 4 || jumpPx > swathPx * 8 : false;
			if (lastPt && !isJump) {
				maskCtx.beginPath();
				maskCtx.moveTo(lastPt.x, lastPt.y);
				maskCtx.lineTo(p.x, p.y);
				maskCtx.stroke();
			} else {
				maskCtx.fillStyle = '#fff';
				maskCtx.fillRect(p.x - swathPx / 2, p.y - swathPx / 2, swathPx, swathPx);
			}
			lastPt = { x: p.x, y: p.y, t };
			redraw();
		}

		(revealOverlayLayer as any).__mcsReveal = { addRevealPoint, resetReveal };

		img.onload = () => {
			mask = document.createElement('canvas');
			mask.width = img.naturalWidth;
			mask.height = img.naturalHeight;
			maskCtx = mask.getContext('2d');
			if (!maskCtx) return;
			updateCanvasPosition();
			bringMissionLayersToFront();
			rebuildRevealFromBuffer();
		};
		img.src = effectiveOverlayUrl;

		const pane = mapInstance.getPanes?.()?.overlayPane;
		pane?.appendChild?.(canvas);
		mapInstance.on?.('move zoom resize', updateCanvasPosition);

		(revealOverlayLayer as any).on?.('remove', () => {
			mapInstance?.off?.('move zoom resize', updateCanvasPosition);
			canvas.remove();
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function syncBaseLayer(L?: any) {
		if (!mapInstance) return;
		const _L = L ?? (await import('leaflet'));

		if (!showBaseLayer || baseLayerOpacity <= 0.001) {
			if (tileLayer) {
				mapInstance.removeLayer(tileLayer);
				tileLayer = null;
			}
			currentTileLayerKey = null;
			return;
		}

		if (!tileLayer || currentTileLayerKey !== baseLayer) {
			if (tileLayer) mapInstance.removeLayer(tileLayer);
			tileLayer = buildTileLayer(_L).addTo(mapInstance);
			currentTileLayerKey = baseLayer;
		}
		tileLayer.setOpacity?.(baseLayerOpacity);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function syncWaypoints(L?: any) {
		if (!mapInstance) return;
		const _L = L ?? (await import('leaflet'));

		if (waypointLayer) {
			mapInstance.removeLayer(waypointLayer);
			waypointLayer = null;
		}
		if (waypointPath) {
			mapInstance.removeLayer(waypointPath);
			waypointPath = null;
		}

		if (!waypoints.length) return;

		const latlngs: [number, number][] = waypoints.map((waypoint: MapWaypoint) => [
			waypoint.lat,
			waypoint.lon
		]);

		if (showWaypointPath && latlngs.length > 1) {
			waypointPath = _L
				.polyline(latlngs, {
					color: waypointPathColor,
					weight: 2,
					opacity: waypointPathOpacity,
					dashArray: '8 6'
				})
				.addTo(mapInstance);
		}

		waypointLayer = _L.layerGroup().addTo(mapInstance);

		for (const waypoint of waypoints) {
			const marker = _L.circleMarker([waypoint.lat, waypoint.lon], {
				radius: waypoint.markerSize ?? 5,
				color: waypoint.color ?? waypointPathColor,
				weight: 2,
				opacity: 1,
				fillColor: waypoint.color ?? waypointPathColor,
				fillOpacity: 0.35
			});

			const popupParts = [
				waypoint.label ? `<strong>${waypoint.label}</strong>` : '',
				waypoint.detail ?? '',
				`Lat: ${waypoint.lat.toFixed(5)}<br/>Lon: ${waypoint.lon.toFixed(5)}`
			].filter(Boolean);

			marker.bindPopup(
				`<div style="font-family:monospace;font-size:11px;line-height:1.5">${popupParts.join('<br/>')}</div>`,
				{ className: 'mcs-popup' }
			);

			if (showWaypointLabels && waypoint.label) {
				marker.bindTooltip(waypoint.label, {
					permanent: true,
					direction: 'top',
					offset: [0, -6],
					className: 'mcs-waypoint-tooltip'
				});
			}

			marker.addTo(waypointLayer);
		}

		bringMissionLayersToFront();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function updateTrail(L?: any) {
		if (!mapInstance) return;
		const _L = L ?? (await import('leaflet'));

		// Use live SSE buffer when a stream is configured, else fall back to sample data
		const gpsData = useLiveStream
			? liveGpsBuffer
			: getSampleGpsSeries({ windowSec: trailWindowSec, points: 200 });
		if (!gpsData.length) return;
		lastGpsData = gpsData;

		const latlngs: [number, number][] = gpsData.map((p) => [p.lat, p.lon]);
		const latest = latlngs[latlngs.length - 1];

		if (trailPolyline) {
			trailPolyline.setLatLngs(latlngs);
		} else if (showGpsTrail) {
			trailPolyline = _L
				.polyline(latlngs, {
					color: trailColor,
					weight: 2.5,
					opacity: 0.8
				})
				.addTo(mapInstance);

			// Make trail clickable for inspection
			if (showInspector) {
				trailPolyline.on('click', (e: { latlng: { lat: number; lng: number } }) => {
					inspectNearestPoint(e.latlng.lat, e.latlng.lng, _L);
				});
			}
		}

		// Current position marker with popup
		if (showMarker) {
			const markerIcon = _L.divIcon({
				className: 'mcs-current-position-marker',
				html: `<div style="
					width:14px;height:14px;
					background:${trailColor};
					border:2.5px solid #fff;
					border-radius:50%;
					box-shadow:0 0 0 3px ${trailColor}44, 0 0 8px ${trailColor}88;
				"></div>`,
				iconSize: [14, 14],
				iconAnchor: [7, 7]
			});

			const last = gpsData[gpsData.length - 1];
			const popupContent = `<div style="font-family:monospace;font-size:11px;line-height:1.5">
				<strong>Current Position</strong><br/>
				Lat: ${last.lat.toFixed(5)}<br/>
				Lon: ${last.lon.toFixed(5)}<br/>
				${last.alt !== undefined ? `Alt: ${last.alt.toFixed(0)} m<br/>` : ''}
				${(last as any).speed !== undefined ? `Speed: ${(last as any).speed.toFixed(1)} m/s<br/>` : ''}
			</div>`;

			if (posMarker) {
				posMarker.setLatLng(latest);
				posMarker.setPopupContent(popupContent);
			} else {
				posMarker = _L
					.marker(latest, { icon: markerIcon })
					.bindPopup(popupContent, { className: 'mcs-popup' })
					.addTo(mapInstance);
			}
		}

		bringMissionLayersToFront();
	}

	function inspectNearestPoint(lat: number, lon: number, L: any) {
		if (!lastGpsData.length) return;
		// Find nearest GPS point to click
		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < lastGpsData.length; i++) {
			const p = lastGpsData[i];
			const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
			if (d < bestDist) {
				bestDist = d;
				bestIdx = i;
			}
		}
		const pt = lastGpsData[bestIdx];
		inspectData = {
			lat: pt.lat,
			lon: pt.lon,
			alt: pt.alt,
			speed: pt.speed,
			time: pt.time ? new Date(pt.time * 1000).toISOString().slice(11, 23) : undefined,
			idx: bestIdx
		};

		// Place inspection marker
		if (inspectMarker) {
			inspectMarker.setLatLng([pt.lat, pt.lon]);
		} else {
			const accent = waypointPathColor || trailColor;
			const icon = L.divIcon({
				className: '',
				html: `<div style="
					width:10px;height:10px;
					background:${accent};
					border:2px solid #fff;
					border-radius:50%;
					box-shadow:0 0 0 2px ${accent}66;
				"></div>`,
				iconSize: [10, 10],
				iconAnchor: [5, 5]
			});
			inspectMarker = L.marker([pt.lat, pt.lon], { icon }).addTo(mapInstance);
		}
	}

	function clearInspection() {
		inspectData = null;
		if (inspectMarker && mapInstance) {
			mapInstance.removeLayer(inspectMarker);
			inspectMarker = null;
		}
	}

	// Called on every SSE update to refresh the map with live data
	function updateLiveTrail(shouldFollow = true) {
		updateTrail();
		if (shouldFollow && autoFollow && liveGpsBuffer.length > 0 && mapInstance) {
			const last = liveGpsBuffer[liveGpsBuffer.length - 1];
			const followBounds = mapInstance.getBounds?.()?.pad?.(-0.12);
			if (!followBounds || !followBounds.contains?.([last.lat, last.lon])) {
				suppressNextViewportSync = true;
				mapInstance.panTo([last.lat, last.lon], { animate: true, duration: 0.5 });
			}
		}
	}

	function rebuildRevealFromBuffer() {
		const api = (revealOverlayLayer as any)?.__mcsReveal;
		if (!api?.resetReveal || !api?.addRevealPoint) return;
		if (!liveGpsBuffer.length) return;
		api.resetReveal();
		const ordered = [...liveGpsBuffer].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
		for (const p of ordered) {
			api.addRevealPoint(p.lat, p.lon, p.time ?? 0);
		}
	}


	$effect(() => {
		const el = mapEl;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			if (mapInstance) scheduleInvalidateSize();
		});
		ro.observe(el);
		untrack(() => {
			void initMap();
		});
		return () => {
			ro.disconnect();
			if (viewPersistTimer) {
				clearTimeout(viewPersistTimer);
				viewPersistTimer = null;
			}
			if (invalidateSizeFrame) {
				cancelAnimationFrame(invalidateSizeFrame);
				invalidateSizeFrame = 0;
			}
			if (mapInstance) {
				mapInstance.off?.('moveend zoomend', handleViewportChanged);
				mapInstance.remove();
				mapInstance = null;
				tileLayer = null;
				trailPolyline = null;
				posMarker = null;
				inspectMarker = null;
				imageOverlay = null;
				revealOverlayLayer = null;
				waypointLayer = null;
				waypointPath = null;
				trailDots = [];
			}
		};
	});

	$effect(() => {
		const desiredView = {
			centerLat: savedCenterLat,
			centerLon: savedCenterLon,
			zoom: initZoom
		};
		if (mapInstance) applySavedView(desiredView);
	});

	$effect(() => {
		const _ = [baseLayer, showBaseLayer, baseLayerOpacity];
		if (mapInstance) void syncBaseLayer();
	});

	$effect(() => {
		const _ = [
			overlayImageUrl,
			overlayLabel,
			overlayOpacity,
			showOverlay,
			overlayBlendMode,
			overlayBounds?.[0]?.[0],
			overlayBounds?.[0]?.[1],
			overlayBounds?.[1]?.[0],
			overlayBounds?.[1]?.[1]
		];
		if (mapInstance) syncOverlay();
	});

	$effect(() => {
		const _ = [
			showWaypointPath,
			waypointPathColor,
			waypointPathOpacity,
			showWaypointLabels,
			...waypoints.map(
				(waypoint: MapWaypoint) =>
					`${waypoint.lat}:${waypoint.lon}:${waypoint.label ?? ''}:${waypoint.detail ?? ''}:${waypoint.color ?? ''}:${waypoint.markerSize ?? ''}`
			)
		];
		if (mapInstance) syncWaypoints();
	});

	$effect(() => {
		if (useLiveStream) return; // SSE handles updates
		const interval = setInterval(() => updateTrail(), pollInterval);
		return () => clearInterval(interval);
	});
</script>

<div class="view-root map-view">
	<ErrorBoundary>
		<div class="map-container" bind:this={mapEl}></div>
		<!-- Top-right: legend only (no stacked cards); zoom stays top-left -->
		{#if hasOverlay}
			<div class="map-hud" aria-label="Overlay value scale">
				<div class="map-legend-strip">
					{#if overlayLabel}
						<div class="legend-title">{overlayLabel}</div>
					{/if}
					<div
						class="legend-ramp"
						role="presentation"
						style:background={overlayLegendRamp ?? undefined}
					></div>
					<div class="legend-scale">
						<span>{overlayLegendLabels.low}</span>
						<span>{overlayLegendLabels.high}</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Flight path inspector panel -->
		{#if inspectData}
			<div class="inspect-panel">
				<div class="inspect-header">
					<span>Path Inspector</span>
					<button class="inspect-close" onclick={clearInspection}>&times;</button>
				</div>
				<div class="inspect-body">
					<div class="inspect-row">
						<span class="inspect-label">Lat</span>
						<span class="inspect-val">{inspectData.lat.toFixed(6)}°</span>
					</div>
					<div class="inspect-row">
						<span class="inspect-label">Lon</span>
						<span class="inspect-val">{inspectData.lon.toFixed(6)}°</span>
					</div>
					{#if inspectData.alt !== undefined}
						<div class="inspect-row">
							<span class="inspect-label">Alt</span>
							<span class="inspect-val">{inspectData.alt.toFixed(0)} m</span>
						</div>
					{/if}
					{#if inspectData.speed !== undefined}
						<div class="inspect-row">
							<span class="inspect-label">Speed</span>
							<span class="inspect-val">{inspectData.speed.toFixed(1)} m/s</span>
						</div>
					{/if}
					{#if inspectData.time}
						<div class="inspect-row">
							<span class="inspect-label">Time</span>
							<span class="inspect-val">{inspectData.time}</span>
						</div>
					{/if}
					<div class="inspect-row">
						<span class="inspect-label">Sample</span>
						<span class="inspect-val">#{inspectData.idx + 1} / {lastGpsData.length}</span>
					</div>
				</div>
			</div>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.view-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
		position: relative;
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	:global(.leaflet-container) {
		background: color-mix(in srgb, var(--mcs-surface) 82%, #111827);
		font-family: var(--mcs-font-sans);
	}

	:global(.mcs-current-position-marker) {
		transition: transform 220ms linear;
		will-change: transform;
	}

	:global(.leaflet-control-attribution) {
		font-size: 9px;
		background: rgba(0, 0, 0, 0.45) !important;
		color: rgba(255, 255, 255, 0.6) !important;
		backdrop-filter: blur(4px);
	}

	:global(.leaflet-control-attribution a) {
		color: rgba(255, 255, 255, 0.7) !important;
	}

	:global(.leaflet-control-zoom a) {
		background: var(--mcs-surface) !important;
		color: var(--mcs-text) !important;
		border-color: var(--mcs-border) !important;
	}

	:global(.leaflet-control-zoom) {
		border: none !important;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
	}

	:global(.leaflet-control-zoom a) {
		width: 32px;
		height: 32px;
		line-height: 32px;
		font-weight: 600;
	}

	:global(.mcs-popup .leaflet-popup-content-wrapper) {
		background: var(--mcs-surface);
		color: var(--mcs-text);
		border: 1px solid var(--mcs-border);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
	}
	:global(.mcs-popup .leaflet-popup-tip) {
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
	}

	:global(.mcs-waypoint-tooltip) {
		background: color-mix(in srgb, var(--mcs-surface) 88%, transparent);
		color: var(--mcs-text);
		border: 1px solid color-mix(in srgb, var(--mcs-border) 88%, transparent);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		padding: 2px 6px;
	}

	:global(.mcs-waypoint-tooltip::before) {
		display: none;
	}

	.map-hud {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		left: auto;
		z-index: 60;
		pointer-events: none;
		max-width: min(14rem, calc(100% - 3.5rem));
	}

	.map-legend-strip {
		padding: 4px 6px;
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		background: var(--mcs-surface);
	}

	.legend-title {
		font-family: var(--mcs-font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.02em;
		color: var(--mcs-text-muted);
		margin-bottom: 4px;
	}

	.legend-ramp {
		height: 0.45rem;
		border-radius: 0;
		background: linear-gradient(
			90deg,
			var(--mcs-surface-alt),
			color-mix(in srgb, var(--mcs-text-muted) 55%, var(--mcs-text) 45%)
		);
		border: 1px solid var(--mcs-border);
	}

	.legend-scale {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 4px;
		font-family: var(--mcs-font-mono);
		font-size: 0.6rem;
		color: var(--mcs-text-muted);
	}

	/* Flight path inspector: theme panel, not floating glass */
	.inspect-panel {
		position: absolute;
		bottom: 0.5rem;
		left: 0.5rem;
		z-index: 60;
		background: var(--mcs-surface);
		color: var(--mcs-text);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		min-width: 172px;
		max-width: calc(100% - 1rem);
		font-family: var(--mcs-font-sans);
	}

	.inspect-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.55rem;
		border-bottom: 1px solid var(--mcs-border);
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--mcs-text-muted);
	}

	.inspect-close {
		background: none;
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		padding: 0 2px;
	}
	.inspect-close:hover {
		color: var(--mcs-text);
	}

	.inspect-body {
		padding: 0.35rem 0.55rem 0.5rem;
	}

	.inspect-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 0.22rem 0;
		font-size: 0.72rem;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 80%, transparent);
	}

	.inspect-row:last-child {
		border-bottom: none;
	}

	.inspect-label {
		color: var(--mcs-text-muted);
		font-size: 0.62rem;
	}

	.inspect-val {
		font-family: var(--mcs-font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.68rem;
		color: var(--mcs-text);
	}

	/* Keep Leaflet built-in controls (zoom +/-) below global modals/overlays. */
	:global(.leaflet-top),
	:global(.leaflet-bottom),
	:global(.leaflet-control-container) {
		/* Above tiles/overlays, but below app-level modals/command palette. */
		z-index: 600 !important;
	}
</style>
