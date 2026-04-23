<script lang="ts">
	import type { OverlayPlotProps } from '$lib/objects/types.js';
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

	let { objectId, props } = $props<{ objectId: string; props: OverlayPlotProps }>();

	const series = $derived(props.series ?? []);
	const showGrid = $derived(props.showGrid ?? true);
	const pollInterval = $derived(props.pollInterval ?? 5000);

	const WINDOW_SEC = 120;

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);

	const ML = 54,
		MT = 10,
		MB = 38;
	const MR_SINGLE = 14,
		MR_DUAL = 54;
	const hasDualAxis = $derived(series.some((s: (typeof series)[0]) => s.axis === 'right'));
	const MR = $derived(hasDualAxis ? MR_DUAL : MR_SINGLE);
	const pw = $derived(Math.max(10, w - ML - MR));
	const ph = $derived(Math.max(10, h - MT - MB));

	type Pt = { timestamp: number; value: number };
	let allSeries = $state<Pt[][]>([]);

	const LIVE_MAX_PTS = 200;
	const liveBuffer: Record<string, Pt[]> = {};

	function fetchData() {
		allSeries = series.map((s: (typeof series)[0]) => {
			const src = s.dataSource;
			if (!src) return [];
			if (isSampleStreamId(src)) {
				return getSampleStreamSeries(src, { windowSec: WINDOW_SEC, points: 150 });
			}
			return liveBuffer[src] ?? [];
		});
	}

	$effect(() => {
		const proj = $currentProject;
		if (!proj || !series.length) return;

		const active = new Set<string>();
		for (const s of series) {
			const src = s.dataSource;
			if (typeof src === 'string' && !isSampleStreamId(src)) active.add(src);
		}
		for (const key of Object.keys(liveBuffer)) {
			if (!active.has(key)) delete liveBuffer[key];
		}

		for (const src of active) {
			if (liveBuffer[src]?.length) continue;
			const load = fetch(`/api/projects/${proj.id}/streams/${encodeURIComponent(src)}/samples?limit=${LIVE_MAX_PTS}`).then(
						(r) => (r.ok ? r.json() : { data: [] })
					);
			load.then((body: { data?: { timestamp: number; value?: number }[] }) => {
					const pts: Pt[] = (body.data ?? [])
						.map((row) => ({
							timestamp: row.timestamp,
							value: typeof row.value === 'number' ? row.value : NaN
						}))
						.filter((p) => !isNaN(p.value));
					if (pts.length) {
						liveBuffer[src] = pts;
						fetchData();
					}
				}).catch(() => {});
		}

		const unsubs: (() => void)[] = [];
		const subscribed = new Set<string>();
		for (const s of series) {
			const src = s.dataSource;
			if (!src || isSampleStreamId(src) || subscribed.has(src)) continue;
			subscribed.add(src);
			const unsub = subscribeSSE(proj.id, src, (event) => {
				if (!('values' in event)) return;
				const v = event.values as Record<string, unknown>;
				let val = NaN;
				if (v.value !== undefined) val = Number(v.value);
				else {
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
				fetchData();
			});
			unsubs.push(unsub);
		}
		return () => {
			for (const u of unsubs) u();
		};
	});

	const allPts = $derived(allSeries.flat());
	const tMin = $derived(
		allPts.length ? Math.min(...allPts.map((p) => p.timestamp)) : Date.now() / 1000 - WINDOW_SEC
	);
	const tMax = $derived(
		allPts.length ? Math.max(...allPts.map((p) => p.timestamp)) : Date.now() / 1000
	);

	// Left axis: series with axis='left' or unset
	const leftPts = $derived(
		allSeries.filter((_: Pt[], i: number) => (series[i]?.axis ?? 'left') === 'left').flat()
	);
	const rightPts = $derived(
		allSeries.filter((_: Pt[], i: number) => series[i]?.axis === 'right').flat()
	);

	const rawLeftMin = $derived(leftPts.length ? Math.min(...leftPts.map((p: Pt) => p.value)) : 0);
	const rawLeftMax = $derived(leftPts.length ? Math.max(...leftPts.map((p: Pt) => p.value)) : 100);
	const vPadLeft = $derived((rawLeftMax - rawLeftMin) * 0.06 || 1);
	const domYminLeft = $derived(props.yAxis?.min != null ? props.yAxis.min : rawLeftMin - vPadLeft);
	const domYmaxLeft = $derived(props.yAxis?.max != null ? props.yAxis.max : rawLeftMax + vPadLeft);

	const rawRightMin = $derived(rightPts.length ? Math.min(...rightPts.map((p: Pt) => p.value)) : 0);
	const rawRightMax = $derived(
		rightPts.length ? Math.max(...rightPts.map((p: Pt) => p.value)) : 100
	);
	const vPadRight = $derived((rawRightMax - rawRightMin) * 0.06 || 1);
	const domYminRight = $derived(
		props.yAxisRight?.min != null ? props.yAxisRight.min : rawRightMin - vPadRight
	);
	const domYmaxRight = $derived(
		props.yAxisRight?.max != null ? props.yAxisRight.max : rawRightMax + vPadRight
	);

	const xScale = $derived(linearScale([tMin, tMax], [0, pw]));
	const yScaleLeft = $derived(linearScale([domYminLeft, domYmaxLeft], [ph, 0]));
	const yScaleRight = $derived(
		hasDualAxis ? linearScale([domYminRight, domYmaxRight], [ph, 0]) : yScaleLeft
	);
	// Left-scale alias for Y-axis ticks and non-per-series logic
	const yScale = $derived(yScaleLeft);

	const xTicks = $derived(niceTicks(tMin, tMax, Math.max(2, Math.floor(pw / 90))));
	const yTicks = $derived(niceTicks(domYminLeft, domYmaxLeft, Math.max(2, Math.floor(ph / 38))));
	const yTicksRight = $derived(
		hasDualAxis ? niceTicks(domYminRight, domYmaxRight, Math.max(2, Math.floor(ph / 38))) : []
	);

	const paths = $derived(
		series.map((s: (typeof series)[0], i: number) => {
			const serPts = allSeries[i] ?? [];
			if ((s.type ?? 'line') !== 'line') return null;
			const sc = s.axis === 'right' ? yScaleRight : yScaleLeft;
			return buildLinePath(
				serPts.map((p) => ({ x: xScale(p.timestamp), y: sc(p.value) })),
				(s.interpolation ?? 'linear') as 'linear' | 'step' | 'smooth' | 'basis'
			);
		})
	);

	const seriesColors = $derived(
		series.map(
			(s: (typeof series)[0], i: number) => s.color || SERIES_COLORS[i % SERIES_COLORS.length]
		)
	);

	// Hover
	let hoverX = $state<number | null>(null);
	const hoverTimestamp = $derived(hoverX !== null ? tMin + (hoverX / pw) * (tMax - tMin) : null);
	const hoverValues = $derived(
		allSeries.map((ser, i) => {
			if (!ser.length || hoverTimestamp === null) return null;
			const idx = nearestByX(ser, hoverTimestamp);
			return idx >= 0 ? { value: ser[idx].value, color: seriesColors[i] } : null;
		})
	);

	const TOOLTIP_W = 160;
	const tooltipX = $derived(
		hoverX !== null ? (hoverX < pw / 2 ? hoverX + ML + 10 : hoverX + ML - TOOLTIP_W - 10) : 0
	);
	const tooltipH = $derived(26 + series.length * 17 + 6);

	function onPointerMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		hoverX = x >= 0 && x <= pw && y >= 0 && y <= ph ? x : null;
	}

	function onPointerLeave() {
		hoverX = null;
	}

	$effect(() => {
		fetchData();
		const id = setInterval(fetchData, pollInterval);
		return () => clearInterval(id);
	});

	$effect(() => {
		const el = containerEl;
		if (!el) return;
		const ro = new ResizeObserver((e) => {
			const r = e[0]?.contentRect;
			if (r) {
				w = r.width || 600;
				h = r.height || 300;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	const clipId = $derived(`op-clip-${objectId}`);
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

					<rect x={0} y={0} width={pw} height={ph} fill="none" class="plot-border" />

					<g clip-path="url(#{clipId})">
						{#each series as s, i}
							{@const color = seriesColors[i]}
							{#if (s.type ?? 'line') === 'line'}
								{@const d = paths[i]}
								{#if d}
									<path
										{d}
										fill="none"
										stroke={color}
										stroke-width="1.75"
										stroke-linejoin="round"
										stroke-linecap="round"
										opacity="0.9"
									/>
								{/if}
							{:else}
								<!-- Scatter dots -->
								{#each allSeries[i] ?? [] as pt}
									{@const sc = s.axis === 'right' ? yScaleRight : yScaleLeft}
									<circle
										cx={xScale(pt.timestamp)}
										cy={sc(pt.value)}
										r={3}
										fill={color}
										opacity="0.65"
									/>
								{/each}
							{/if}
						{/each}

						<!-- Crosshair + dots -->
						{#if hoverX !== null}
							<line x1={hoverX} y1={0} x2={hoverX} y2={ph} class="crosshair" />
							{#each hoverValues as hv, hi}
								{#if hv !== null}
									{@const sc = series[hi]?.axis === 'right' ? yScaleRight : yScaleLeft}
									{@const cy = sc(hv.value)}
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
							<text x={lx} y={ph + 14} class="axis-label" text-anchor="middle">
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

					<!-- Right Y Axis -->
					{#if hasDualAxis}
						<line x1={pw} y1={0} x2={pw} y2={ph} class="axis-line axis-right" />
						{#each yTicksRight as ty}
							{@const ly = yScaleRight(ty)}
							{#if ly >= 0 && ly <= ph}
								<line x1={pw} y1={ly} x2={pw + 4} y2={ly} class="axis-line" />
								<text x={pw + 8} y={ly + 4} class="axis-label" text-anchor="start">
									{formatValue(ty, Math.abs(ty) < 10 ? 2 : 1)}
								</text>
							{/if}
						{/each}
						{#if props.yAxisRight?.label}
							<text
								x={pw + MR - 10}
								y={ph / 2}
								class="axis-title"
								text-anchor="middle"
								transform="rotate(90, {pw + MR - 10}, {ph / 2})"
							>
								{props.yAxisRight.label}
							</text>
						{/if}
					{/if}
				</g>

				<!-- Tooltip -->
				{#if hoverX !== null && hoverTimestamp !== null && series.length}
					<g class="tooltip" transform="translate({tooltipX},{MT + 6})">
						<rect x={0} y={0} width={TOOLTIP_W} height={tooltipH} rx={4} class="tooltip-bg" />
						<text x={8} y={16} class="tooltip-time">
							{formatTimestamp(hoverTimestamp, tMax - tMin)}
						</text>
						{#each series as s, i}
							{@const ty = 28 + i * 17}
							{@const hv = hoverValues[i]}
							{@const color = seriesColors[i]}
							<rect x={8} y={ty - 7} width={7} height={7} fill={color} rx={1.5} />
							<text x={19} y={ty} class="tooltip-label">
								{s.name || s.dataSource || `Series ${i + 1}`}
							</text>
							<text x={TOOLTIP_W - 8} y={ty} class="tooltip-value" text-anchor="end">
								{hv !== null ? formatValue(hv.value, 2) : '—'}
							</text>
						{/each}
					</g>
				{/if}
			</svg>

			<!-- Legend -->
			{#if series.length > 1}
				<div class="legend">
					{#each series as s, i}
						{@const color = seriesColors[i]}
						<span class="legend-item">
							<svg width="18" height="10" style="overflow:visible;flex-shrink:0">
								{#if (s.type ?? 'line') === 'scatter'}
									<circle cx={9} cy={5} r={4} fill={color} opacity="0.8" />
								{:else}
									<line x1={0} y1={5} x2={18} y2={5} stroke={color} stroke-width="2" />
								{/if}
							</svg>
							{s.name || s.dataSource || `Series ${i + 1}`}
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
		overflow: hidden;
		display: flex;
		flex-direction: column;
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
		font-size: 10px;
		fill: var(--mcs-text-muted);
	}

	.axis-title {
		font-family: var(--mcs-font-sans);
		font-size: 10.5px;
		fill: var(--mcs-text-muted);
	}

	.crosshair {
		stroke: var(--mcs-text-muted);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0.6;
		pointer-events: none;
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
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
	}

	.tooltip-label {
		font-family: var(--mcs-font-sans);
		font-size: 10px;
		fill: var(--mcs-text-muted);
	}

	.tooltip-value {
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		fill: var(--mcs-text);
		font-weight: 500;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		padding: 0 0 6px calc(54px + 4px);
		pointer-events: none;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--mcs-font-sans);
		font-size: 10.5px;
		color: var(--mcs-text-muted);
		white-space: nowrap;
	}
</style>
