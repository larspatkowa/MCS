<script lang="ts">
	import type { LinePlotProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import {
		linearScale,
		niceTicks,
		buildLinePath,
		formatTimestamp,
		formatValue,
		SERIES_COLORS,
		nearestByX
	} from '$lib/charts/chart-utils.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: LinePlotProps }>();

	// Derived props
	const dataSources = $derived(props.dataSources ?? []);
	const seriesNames = $derived(props.seriesNames ?? []);
	const interpolation = $derived(
		(props.interpolation ?? 'linear') as 'linear' | 'step' | 'smooth' | 'basis'
	);
	const showGrid = $derived(props.showGrid ?? true);
	const colors = $derived(props.colors?.length ? props.colors : [...SERIES_COLORS]);
	const pollInterval = $derived(props.pollInterval ?? 5000);
	const limitBands = $derived(props.limitBands);

	const WINDOW_SEC = 120;

	// Container
	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);

	// Margins — scale down in small containers
	const ML = $derived(w < 200 ? Math.max(20, w * 0.2) : 54);
	const MR = $derived(w < 200 ? 6 : 14);
	const MT = $derived(h < 150 ? 4 : 10);
	const MB = $derived(h < 150 ? Math.max(16, h * 0.15) : 38);
	const pw = $derived(Math.max(10, w - ML - MR));
	const ph = $derived(Math.max(10, h - MT - MB));

	// Data
	type Pt = { timestamp: number; value: number };
	let allSeries = $state<Pt[][]>([]);

	// Ring buffer for live SSE streams (non-sample). Plain object — not $state so
	// SSE callbacks updating it don't cause effect re-runs; fetchData() is called
	// explicitly from the SSE handler instead.
	const LIVE_MAX_PTS = 200;
	const liveBuffer: Record<string, Pt[]> = {};

	function fetchData() {
		allSeries = dataSources.map((src: string) => {
			if (isSampleStreamId(src)) {
				return getSampleStreamSeries(src, { windowSec: WINDOW_SEC, points: 150 });
			}
			return liveBuffer[src] ?? [];
		});
	}

	// Domain computation
	const allPts = $derived(allSeries.flat());
	const tMin = $derived(
		allPts.length ? Math.min(...allPts.map((p) => p.timestamp)) : Date.now() / 1000 - WINDOW_SEC
	);
	const tMax = $derived(
		allPts.length ? Math.max(...allPts.map((p) => p.timestamp)) : Date.now() / 1000
	);
	const rawValueMin = $derived(allPts.length ? Math.min(...allPts.map((p) => p.value)) : 0);
	const rawValueMax = $derived(allPts.length ? Math.max(...allPts.map((p) => p.value)) : 100);
	// Expand domain to include limit band values if set
	const domainMin = $derived.by(() => {
		let m = props.yAxis?.min ?? rawValueMin;
		if (limitBands?.redLow != null) m = Math.min(m, limitBands.redLow);
		if (limitBands?.yellowLow != null) m = Math.min(m, limitBands.yellowLow);
		const pad = ((props.yAxis?.max ?? rawValueMax) - m) * 0.06 || 1;
		return props.yAxis?.min ?? m - pad;
	});
	const domainMax = $derived.by(() => {
		let m = props.yAxis?.max ?? rawValueMax;
		if (limitBands?.redHigh != null) m = Math.max(m, limitBands.redHigh);
		if (limitBands?.yellowHigh != null) m = Math.max(m, limitBands.yellowHigh);
		const pad = (m - (props.yAxis?.min ?? rawValueMin)) * 0.06 || 1;
		return props.yAxis?.max ?? m + pad;
	});

	const xScale = $derived(linearScale([tMin, tMax], [0, pw]));
	const yScale = $derived(linearScale([domainMin, domainMax], [ph, 0]));

	const xTickCount = $derived(Math.max(2, Math.floor(pw / 90)));
	const yTickCount = $derived(Math.max(2, Math.floor(ph / 38)));
	const xTicks = $derived(niceTicks(tMin, tMax, xTickCount));
	const yTicks = $derived(niceTicks(domainMin, domainMax, yTickCount));

	const paths = $derived(
		allSeries.map((s) =>
			buildLinePath(
				s.map((p) => ({ x: xScale(p.timestamp), y: yScale(p.value) })),
				interpolation
			)
		)
	);

	// Hover state
	let hoverX = $state<number | null>(null);

	const hoverTimestamp = $derived(hoverX !== null ? tMin + (hoverX / pw) * (tMax - tMin) : null);

	const hoverValues = $derived(
		allSeries.map((series, i) => {
			if (!series.length || hoverTimestamp === null) return null;
			const idx = nearestByX(series, hoverTimestamp);
			if (idx < 0) return null;
			return { value: series[idx].value, color: colors[i % colors.length] };
		})
	);

	const tooltipOnRight = $derived(hoverX !== null ? hoverX < pw / 2 : false);
	const TOOLTIP_W = $derived(Math.min(152, w * 0.6));
	const tooltipX = $derived(
		hoverX !== null ? (tooltipOnRight ? hoverX + ML + 10 : hoverX + ML - TOOLTIP_W - 10) : 0
	);
	const tooltipRows = $derived(
		(seriesNames.length ? seriesNames : dataSources).map((name: string, i: number) => ({
			name: name || `Series ${i + 1}`,
			val: hoverValues[i],
			color: colors[i % colors.length]
		}))
	);
	const tooltipH = $derived(26 + tooltipRows.length * 17 + 6);

	function onPointerMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		hoverX = x >= 0 && x <= pw && y >= 0 && y <= ph ? x : null;
	}

	function onPointerLeave() {
		hoverX = null;
	}

	// SSE subscription for non-sample (plugin) streams
	$effect(() => {
		const proj = $currentProject;
		const sources = dataSources;
		if (!proj || !sources.length) return;

		// Drop stale buffers for streams that are no longer in dataSources
		const active = new Set(sources.filter((s: string) => !isSampleStreamId(s)));
		for (const key of Object.keys(liveBuffer)) {
			if (!active.has(key)) delete liveBuffer[key];
		}

		// Seed live buffers from historical samples fetched from the REST API
		for (const src of active) {
			if (liveBuffer[src as string]?.length) continue; // already seeded
			const sid = encodeURIComponent(src as string);
			fetch(`/api/projects/${proj.id}/streams/${sid}/samples?limit=${LIVE_MAX_PTS}`)
				.then((r) => (r.ok ? r.json() : { data: [] }))
				.then((body: { data?: { timestamp: number; value?: number; [k: string]: unknown }[] }) => {
					const pts: Pt[] = (body.data ?? [])
						.map((s) => ({
							timestamp: s.timestamp,
							value: typeof s.value === 'number' ? s.value : NaN
						}))
						.filter((p) => !isNaN(p.value));
					if (pts.length) {
						liveBuffer[src as string] = pts;
						fetchData();
					}
				})
				.catch(() => {});
		}

		const unsubs: (() => void)[] = [];
		for (const src of sources) {
			if (!isSampleStreamId(src)) {
				const unsub = subscribeSSE(proj.id, src, (event) => {
					if (!('values' in event)) return;
					const v = event.values as Record<string, unknown>;
					let val = NaN;
					if (v.value !== undefined) {
						val = Number(v.value);
					} else {
						const n = Object.values(v)
							.map(Number)
							.find((x) => !isNaN(x));
						if (n !== undefined) val = n;
					}
					if (isNaN(val)) return;
					const buf = liveBuffer[src] ?? [];
					buf.push({ timestamp: event.timestamp, value: val });
					if (buf.length > LIVE_MAX_PTS) buf.splice(0, buf.length - LIVE_MAX_PTS);
					liveBuffer[src] = buf;
					fetchData(); // update chart immediately on each new point
				});
				unsubs.push(unsub);
			}
		}
		return () => {
			for (const u of unsubs) u();
		};
	});

	// Polling (sample streams)
	$effect(() => {
		fetchData();
		const id = setInterval(fetchData, pollInterval);
		return () => clearInterval(id);
	});

	// ResizeObserver
	$effect(() => {
		const el = containerEl;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0]?.contentRect;
			if (r) {
				w = r.width || 600;
				h = r.height || 300;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	const clipId = $derived(`lp-clip-${objectId}`);

	// Limit band helper: clamp a y-value to plot area
	function clampY(v: number | undefined, fallback: number): number {
		if (v == null) return fallback;
		return Math.max(0, Math.min(ph, yScale(v)));
	}

	// Reference lines — computed as SVG paths/coords in plot space
	type RefLineRender =
		| {
				kind: 'line';
				x1: number;
				y1: number;
				x2: number;
				y2: number;
				label: string;
				color: string;
				dasharray: string;
		  }
		| { kind: 'path'; d: string; label: string; color: string; dasharray: string };

	const referenceLineRenders = $derived.by((): RefLineRender[] => {
		const refs = props.referenceLines;
		if (!refs?.length) return [];
		return refs.map((ref: any) => {
			const color = ref.color ?? 'rgba(255,255,255,0.5)';
			const label = ref.label ?? '';
			const dasharray = ref.style === 'dotted' ? '2 4' : ref.style === 'dashed' ? '8 4' : 'none';

			if (ref.type === 'constant' && ref.value != null) {
				const y = yScale(ref.value);
				return { kind: 'line', x1: 0, y1: y, x2: pw, y2: y, label, color, dasharray };
			} else if (ref.type === 'linear') {
				const slope = ref.slope ?? 0;
				const intercept = ref.intercept ?? 0;
				const dt = tMax - tMin;
				const y0 = yScale(intercept);
				const y1 = yScale(slope * dt + intercept);
				return { kind: 'line', x1: 0, y1: y0, x2: pw, y2: y1, label, color, dasharray };
			} else {
				// quadratic: a*(dt)^2 + b*(dt) + c where dt = t - tMin
				const a = ref.a ?? 0;
				const b = ref.b ?? 0;
				const c = ref.c ?? 0;
				const steps = 60;
				const pts: string[] = [];
				for (let i = 0; i <= steps; i++) {
					const frac = i / steps;
					const dt = frac * (tMax - tMin);
					const val = a * dt * dt + b * dt + c;
					const x = frac * pw;
					const y = yScale(val);
					pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
				}
				return { kind: 'path', d: pts.join(' '), label, color, dasharray };
			}
		});
	});
</script>

<div class="view-root" bind:this={containerEl}>
	<ErrorBoundary>
		{#if w > 0 && h > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg width={w} height={h} style="display:block;overflow:visible;cursor:crosshair">
				<defs>
					<clipPath id={clipId}>
						<rect x={0} y={0} width={pw} height={ph} />
					</clipPath>
				</defs>

				<g transform="translate({ML},{MT})">
					<!-- Transparent hitbox to drive hover -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<rect
						x={0}
						y={0}
						width={pw}
						height={ph}
						fill="transparent"
						onpointermove={onPointerMove}
						onpointerleave={onPointerLeave}
					/>

					<!-- Limit bands (behind grid) -->
					{#if limitBands?.showBands !== false}
						{#if limitBands?.redHigh != null}
							{@const y1 = clampY(limitBands.redHigh, 0)}
							{@const y2 = clampY(domainMax, 0)}
							<rect
								x={0}
								y={Math.min(y1, y2)}
								width={pw}
								height={Math.abs(y1 - y2)}
								fill="rgba(239,68,68,0.12)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.redHigh, 0)}
								y2={clampY(limitBands.redHigh, 0)}
								stroke="rgba(239,68,68,0.55)"
								stroke-width="1"
								stroke-dasharray="6 3"
							/>
						{/if}
						{#if limitBands?.yellowHigh != null}
							{@const y1 = clampY(limitBands.yellowHigh, 0)}
							{@const y2 =
								limitBands?.redHigh != null ? clampY(limitBands.redHigh, 0) : clampY(domainMax, 0)}
							<rect
								x={0}
								y={Math.min(y1, y2)}
								width={pw}
								height={Math.abs(y1 - y2)}
								fill="rgba(245,158,11,0.1)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.yellowHigh, 0)}
								y2={clampY(limitBands.yellowHigh, 0)}
								stroke="rgba(245,158,11,0.55)"
								stroke-width="1"
								stroke-dasharray="6 3"
							/>
						{/if}
						{#if limitBands?.redLow != null}
							{@const y1 = clampY(limitBands.redLow, ph)}
							{@const y2 = clampY(domainMin, ph)}
							<rect
								x={0}
								y={Math.min(y1, y2)}
								width={pw}
								height={Math.abs(y1 - y2)}
								fill="rgba(239,68,68,0.12)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.redLow, ph)}
								y2={clampY(limitBands.redLow, ph)}
								stroke="rgba(239,68,68,0.55)"
								stroke-width="1"
								stroke-dasharray="6 3"
							/>
						{/if}
						{#if limitBands?.yellowLow != null}
							{@const y1 = clampY(limitBands.yellowLow, ph)}
							{@const y2 =
								limitBands?.redLow != null ? clampY(limitBands.redLow, ph) : clampY(domainMin, ph)}
							<rect
								x={0}
								y={Math.min(y1, y2)}
								width={pw}
								height={Math.abs(y1 - y2)}
								fill="rgba(245,158,11,0.1)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.yellowLow, ph)}
								y2={clampY(limitBands.yellowLow, ph)}
								stroke="rgba(245,158,11,0.55)"
								stroke-width="1"
								stroke-dasharray="6 3"
							/>
						{/if}
					{/if}

					<!-- Grid -->
					{#if showGrid}
						{#each xTicks as tx}
							{@const lx = xScale(tx)}
							{#if lx >= -1 && lx <= pw + 1}
								<line x1={lx} y1={0} x2={lx} y2={ph} class="grid-line" />
							{/if}
						{/each}
						{#each yTicks as ty}
							{@const ly = yScale(ty)}
							{#if ly >= -1 && ly <= ph + 1}
								<line x1={0} y1={ly} x2={pw} y2={ly} class="grid-line" />
							{/if}
						{/each}
					{/if}

					<!-- Plot border -->
					<rect x={0} y={0} width={pw} height={ph} fill="none" class="plot-border" />

					<!-- Series lines (clipped) -->
					<g clip-path="url(#{clipId})">
						{#each paths as d, i}
							{#if d}
								<path
									{d}
									fill="none"
									stroke={colors[i % colors.length]}
									stroke-width="1.75"
									stroke-linejoin="round"
									stroke-linecap="round"
									opacity="0.9"
								/>
							{/if}
						{/each}

						<!-- Reference lines / curves -->
						{#each referenceLineRenders as ref}
							{#if ref.kind === 'line'}
								<line
									x1={ref.x1}
									y1={ref.y1}
									x2={ref.x2}
									y2={ref.y2}
									stroke={ref.color}
									stroke-width="1.5"
									stroke-dasharray={ref.dasharray === 'none' ? undefined : ref.dasharray}
									opacity="0.75"
								/>
								{#if ref.label}
									<text
										x={ref.x2 - 4}
										y={ref.y2 - 4}
										class="ref-label"
										text-anchor="end"
										fill={ref.color}>{ref.label}</text
									>
								{/if}
							{:else}
								<path
									d={ref.d}
									fill="none"
									stroke={ref.color}
									stroke-width="1.5"
									stroke-dasharray={ref.dasharray === 'none' ? undefined : ref.dasharray}
									opacity="0.75"
								/>
								{#if ref.label}
									<text class="ref-label" fill={ref.color}>
										<textPath href="#{clipId}" startOffset="95%" text-anchor="end"
											>{ref.label}</textPath
										>
									</text>
								{/if}
							{/if}
						{/each}

						<!-- Hover crosshair + dots -->
						{#if hoverX !== null}
							<line x1={hoverX} y1={0} x2={hoverX} y2={ph} class="crosshair" />
							{#each hoverValues as hv, i}
								{#if hv !== null}
									{@const cy = yScale(hv.value)}
									{#if cy >= -4 && cy <= ph + 4}
										<circle
											cx={hoverX}
											{cy}
											r={4.5}
											fill={hv.color}
											stroke="var(--mcs-bg)"
											stroke-width="2"
										/>
									{/if}
								{/if}
							{/each}
						{/if}
					</g>

					<!-- X Axis -->
					<line x1={0} y1={ph} x2={pw} y2={ph} class="axis-line" />
					{#each xTicks as tx}
						{@const lx = xScale(tx)}
						{#if lx >= 0 && lx <= pw}
							<text x={lx} y={ph + 15} class="axis-label" text-anchor="middle">
								{formatTimestamp(tx, tMax - tMin)}
							</text>
						{/if}
					{/each}
					{#if props.xAxis?.label}
						<text x={pw / 2} y={ph + 32} class="axis-title" text-anchor="middle">
							{props.xAxis.label}
						</text>
					{/if}

					<!-- Y Axis -->
					<line x1={0} y1={0} x2={0} y2={ph} class="axis-line" />
					{#each yTicks as ty}
						{@const ly = yScale(ty)}
						{#if ly >= 0 && ly <= ph}
							<text x={-7} y={ly + 4} class="axis-label" text-anchor="end">
								{formatValue(ty, Math.abs(ty) < 10 ? 2 : 1)}
							</text>
						{/if}
					{/each}
					{#if props.yAxis?.label}
						<text
							x={-(ML - 14)}
							y={ph / 2}
							class="axis-title"
							text-anchor="middle"
							transform="rotate(-90, {-(ML - 14)}, {ph / 2})"
						>
							{props.yAxis.label}
						</text>
					{/if}
				</g>

				<!-- Hover tooltip -->
				{#if hoverX !== null && hoverTimestamp !== null && tooltipRows.length}
					<g class="tooltip" transform="translate({tooltipX},{MT + 6})">
						<rect x={0} y={0} width={TOOLTIP_W} height={tooltipH} rx={4} class="tooltip-bg" />
						<text x={8} y={16} class="tooltip-time">
							{formatTimestamp(hoverTimestamp, tMax - tMin)}
						</text>
						{#each tooltipRows as row, i}
							{@const ty = 28 + i * 17}
							<rect x={8} y={ty - 7} width={7} height={7} fill={row.color} rx={1.5} />
							<text x={19} y={ty} class="tooltip-label">{row.name}</text>
							<text x={TOOLTIP_W - 8} y={ty} class="tooltip-value" text-anchor="end">
								{row.val !== null ? formatValue(row.val.value, 2) : '—'}
							</text>
						{/each}
					</g>
				{/if}
			</svg>

			<!-- Legend -->
			{#if allSeries.length > 1}
				<div class="legend">
					{#each seriesNames.length ? seriesNames : dataSources as name, i}
						<span class="legend-item">
							<svg width="18" height="10" style="overflow:visible;flex-shrink:0">
								<line
									x1={0}
									y1={5}
									x2={18}
									y2={5}
									stroke={colors[i % colors.length]}
									stroke-width="2"
								/>
							</svg>
							{name || `Series ${i + 1}`}
						</span>
					{/each}
				</div>
			{/if}
		{/if}
	</ErrorBoundary>
</div>

<style>
	.view-root {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		container-type: inline-size;
	}

	.grid-line {
		stroke: var(--mcs-border);
		stroke-width: 1;
		stroke-dasharray: 3 4;
		opacity: 0.7;
	}

	.plot-border {
		stroke: var(--mcs-border);
		stroke-width: 1;
	}

	.axis-line {
		stroke: var(--mcs-border);
		stroke-width: 1;
	}

	.axis-label {
		font-family: var(--mcs-font-mono);
		font-size: clamp(8px, 2.8cqw, 10px);
		fill: var(--mcs-text-muted);
	}

	.axis-title {
		font-family: var(--mcs-font-sans);
		font-size: clamp(8px, 2.9cqw, 10.5px);
		fill: var(--mcs-text-muted);
	}

	.crosshair {
		stroke: var(--mcs-text-muted);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		pointer-events: none;
		opacity: 0.6;
	}

	.tooltip-bg {
		fill: var(--mcs-surface);
		stroke: var(--mcs-border);
		stroke-width: 1;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
	}

	.tooltip {
		pointer-events: none;
	}

	.tooltip-time {
		font-family: var(--mcs-font-mono);
		font-size: clamp(8px, 2.6cqw, 9.5px);
		fill: var(--mcs-text-muted);
	}

	.tooltip-label {
		font-family: var(--mcs-font-sans);
		font-size: clamp(8px, 2.8cqw, 10px);
		fill: var(--mcs-text-muted);
	}

	.tooltip-value {
		font-family: var(--mcs-font-mono);
		font-size: clamp(8px, 2.8cqw, 10px);
		fill: var(--mcs-text);
		font-weight: 500;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		padding: 0 0 6px 8px;
		pointer-events: none;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--mcs-font-sans);
		font-size: clamp(8px, 2.9cqw, 10.5px);
		color: var(--mcs-text-muted);
		white-space: nowrap;
	}

	.ref-label {
		font-family: var(--mcs-font-sans);
		font-size: 9px;
		opacity: 0.8;
		pointer-events: none;
	}
</style>
