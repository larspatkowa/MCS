<script lang="ts">
	import type { ScatterPlotProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import {
		linearScale,
		niceTicks,
		formatValue,
		SERIES_COLORS,
		linearRegression,
		nearestPoint2D
	} from '$lib/charts/chart-utils.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: ScatterPlotProps }>();

	const dataSources = $derived(props.dataSources ?? []);
	const markerSize = $derived(props.markerSize ?? 4);
	const colors = $derived(props.colors?.length ? props.colors : [...SERIES_COLORS]);
	const pollInterval = $derived(props.pollInterval ?? 5000);
	const showGrid = $derived((props as any).showGrid !== false);
	const showFit = $derived((props as any).showFit !== false);

	const WINDOW_SEC = 120;

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);

	const ML = 54,
		MR = 14,
		MT = 10,
		MB = 38;
	const pw = $derived(Math.max(10, w - ML - MR));
	const ph = $derived(Math.max(10, h - MT - MB));

	type Pt = { timestamp: number; value: number };
	let rawSeries = $state<Pt[][]>([]);

	function fetchData() {
		rawSeries = dataSources.map((src: string) =>
			isSampleStreamId(src)
				? getSampleStreamSeries(src, { windowSec: WINDOW_SEC, points: 120 })
				: []
		);
	}

	// Build {x, y} scatter points by aligning two series by index
	const scatterData = $derived.by(() => {
		const groups: { x: number; y: number; seriesIdx: number }[] = [];
		if (rawSeries.length < 2) {
			// Single stream: use (index, value) as (x, y)
			const s = rawSeries[0] ?? [];
			for (let i = 0; i < s.length; i++) {
				groups.push({ x: i, y: s[i].value, seriesIdx: 0 });
			}
			return groups;
		}
		// Two streams: pair by index
		const s0 = rawSeries[0] ?? [];
		const s1 = rawSeries[1] ?? [];
		const len = Math.min(s0.length, s1.length);
		for (let i = 0; i < len; i++) {
			groups.push({ x: s0[i].value, y: s1[i].value, seriesIdx: 0 });
		}
		return groups;
	});

	const xMin = $derived(scatterData.length ? Math.min(...scatterData.map((p) => p.x)) : 0);
	const xMax = $derived(scatterData.length ? Math.max(...scatterData.map((p) => p.x)) : 100);
	const yMin = $derived(scatterData.length ? Math.min(...scatterData.map((p) => p.y)) : 0);
	const yMax = $derived(scatterData.length ? Math.max(...scatterData.map((p) => p.y)) : 100);
	const xPad = $derived((xMax - xMin) * 0.06 || 1);
	const yPad = $derived((yMax - yMin) * 0.06 || 1);
	const domXmin = $derived(props.xAxis?.min != null ? Number(props.xAxis.min) : xMin - xPad);
	const domXmax = $derived(props.xAxis?.max != null ? Number(props.xAxis.max) : xMax + xPad);
	const domYmin = $derived(props.yAxis?.min != null ? props.yAxis.min : yMin - yPad);
	const domYmax = $derived(props.yAxis?.max != null ? props.yAxis.max : yMax + yPad);

	const xScale = $derived(linearScale([domXmin, domXmax], [0, pw]));
	const yScale = $derived(linearScale([domYmin, domYmax], [ph, 0]));

	const xTickCount = $derived(Math.max(2, Math.floor(pw / 80)));
	const yTickCount = $derived(Math.max(2, Math.floor(ph / 40)));
	const xTicks = $derived(niceTicks(domXmin, domXmax, xTickCount));
	const yTicks = $derived(niceTicks(domYmin, domYmax, yTickCount));

	// Screen coordinates for each point
	const screenPoints = $derived(
		scatterData.map((p) => ({ sx: xScale(p.x), sy: yScale(p.y), x: p.x, y: p.y }))
	);

	// Linear regression
	const regression = $derived(linearRegression(scatterData));

	// Regression line endpoints (clamped to domain)
	const fitLine = $derived.by(() => {
		if (!showFit || scatterData.length < 3) return null;
		const { slope, intercept } = regression;
		// y = slope * x + intercept
		const y0 = slope * domXmin + intercept;
		const y1 = slope * domXmax + intercept;
		return {
			x1: xScale(domXmin),
			y1: yScale(y0),
			x2: xScale(domXmax),
			y2: yScale(y1)
		};
	});

	// Hover
	let mouseX = $state<number | null>(null);
	let mouseY = $state<number | null>(null);

	const hoveredIdx = $derived.by(() => {
		if (mouseX === null || mouseY === null || !screenPoints.length) return -1;
		const idx = nearestPoint2D(screenPoints, mouseX, mouseY);
		if (idx < 0) return -1;
		const { sx, sy } = screenPoints[idx];
		const dist = Math.sqrt((sx - mouseX) ** 2 + (sy - mouseY) ** 2);
		return dist < 28 ? idx : -1;
	});

	const hoveredPoint = $derived(hoveredIdx >= 0 ? screenPoints[hoveredIdx] : null);

	// Tooltip positioning
	const TOOLTIP_W = 160;
	const TOOLTIP_H = 80;
	const tooltipX = $derived(
		hoveredPoint !== null
			? hoveredPoint.sx + ML + 12 + TOOLTIP_W > w
				? hoveredPoint.sx + ML - TOOLTIP_W - 12
				: hoveredPoint.sx + ML + 12
			: 0
	);
	const tooltipY = $derived(
		hoveredPoint !== null ? Math.max(MT, Math.min(h - TOOLTIP_H - 4, hoveredPoint.sy + MT - 20)) : 0
	);

	function onPointerMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		if (mx >= 0 && mx <= pw && my >= 0 && my <= ph) {
			mouseX = mx;
			mouseY = my;
			return;
		}
		mouseX = null;
		mouseY = null;
	}

	function onPointerLeave() {
		mouseX = null;
		mouseY = null;
	}

	$effect(() => {
		fetchData();
		const id = setInterval(fetchData, pollInterval);
		return () => clearInterval(id);
	});

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

	const clipId = $derived(`sc-clip-${objectId}`);
	const r2Pct = $derived(Math.round(regression.r2 * 100));
	const xLabel = $derived(props.xAxis?.label ?? (dataSources[0] || 'X'));
	const yLabel = $derived(props.yAxis?.label ?? (dataSources[1] || 'Y'));
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
						<!-- Regression line (behind points) -->
						{#if fitLine}
							<line
								x1={fitLine.x1}
								y1={fitLine.y1}
								x2={fitLine.x2}
								y2={fitLine.y2}
								stroke={colors[0]}
								stroke-width="1.5"
								stroke-dasharray="6 3"
								opacity="0.6"
							/>
						{/if}

						<!-- Scatter points -->
						{#each screenPoints as sp, i}
							<circle
								cx={sp.sx}
								cy={sp.sy}
								r={hoveredIdx === i ? markerSize + 2 : markerSize}
								fill={colors[0]}
								opacity={hoveredIdx === i ? 1 : 0.65}
								stroke={hoveredIdx === i ? 'var(--mcs-bg)' : 'none'}
								stroke-width={hoveredIdx === i ? 2 : 0}
								style="transition: r 0.1s, opacity 0.1s"
							/>
						{/each}

						<!-- Hover crosshair lines -->
						{#if hoveredPoint !== null}
							<line x1={hoveredPoint.sx} y1={0} x2={hoveredPoint.sx} y2={ph} class="crosshair" />
							<line x1={0} y1={hoveredPoint.sy} x2={pw} y2={hoveredPoint.sy} class="crosshair" />
						{/if}
					</g>

					<!-- Regression stats badge (top-right of plot area) -->
					{#if fitLine && scatterData.length >= 3}
						{@const bx = pw - 4}
						{@const by = 6}
						<text x={bx} y={by + 8} class="stats-text" text-anchor="end">
							y = {formatValue(regression.slope, 3)}x
							{regression.intercept >= 0
								? '+ ' + formatValue(regression.intercept, 2)
								: '– ' + formatValue(-regression.intercept, 2)}
						</text>
						<text x={bx} y={by + 20} class="stats-r2" text-anchor="end">
							R² = {formatValue(regression.r2, 3)}
							({r2Pct}%)
						</text>
					{/if}

					<!-- X Axis -->
					<line x1={0} y1={ph} x2={pw} y2={ph} class="axis-line" />
					{#each xTicks as tx}
						{@const lx = xScale(tx)}
						{#if lx >= 0 && lx <= pw}
							<text x={lx} y={ph + 14} class="axis-label" text-anchor="middle">
								{formatValue(tx, Math.abs(tx) < 10 ? 2 : 1)}
							</text>
						{/if}
					{/each}
					<text x={pw / 2} y={ph + 32} class="axis-title" text-anchor="middle">
						{xLabel}
					</text>

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
					<text
						x={-(ML - 14)}
						y={ph / 2}
						class="axis-title"
						text-anchor="middle"
						transform="rotate(-90, {-(ML - 14)}, {ph / 2})"
					>
						{yLabel}
					</text>
				</g>

				<!-- Hover tooltip -->
				{#if hoveredPoint !== null}
					<g class="tooltip" transform="translate({tooltipX},{tooltipY})">
						<rect x={0} y={0} width={TOOLTIP_W} height={TOOLTIP_H} rx={4} class="tooltip-bg" />
						<text x={8} y={17} class="tooltip-header">Point {hoveredIdx + 1}</text>
						<text x={8} y={34} class="tooltip-label">{xLabel}</text>
						<text x={TOOLTIP_W - 8} y={34} class="tooltip-value" text-anchor="end">
							{formatValue(hoveredPoint.x, 3)}
						</text>
						<text x={8} y={51} class="tooltip-label">{yLabel}</text>
						<text x={TOOLTIP_W - 8} y={51} class="tooltip-value" text-anchor="end">
							{formatValue(hoveredPoint.y, 3)}
						</text>
						{#if fitLine}
							{@const predicted = regression.slope * hoveredPoint.x + regression.intercept}
							{@const residual = hoveredPoint.y - predicted}
							<text x={8} y={68} class="tooltip-label">Residual</text>
							<text x={TOOLTIP_W - 8} y={68} class="tooltip-value" text-anchor="end">
								{residual >= 0 ? '+' : ''}{formatValue(residual, 3)}
							</text>
						{/if}
					</g>
				{/if}

				<!-- Sample count badge (top-left, won't overlap regression stats in top-right) -->
				<text x={ML + 4} y={MT + 9} class="badge-text" text-anchor="start" opacity="0.45">
					n={scatterData.length}
				</text>
			</svg>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.view-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
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
		opacity: 0.4;
		pointer-events: none;
	}

	.stats-text {
		font-family: var(--mcs-font-mono);
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
	}

	.stats-r2 {
		font-family: var(--mcs-font-mono);
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
		font-weight: 500;
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

	.tooltip-header {
		font-family: var(--mcs-font-sans);
		font-size: 10px;
		fill: var(--mcs-text-muted);
		font-weight: 500;
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

	.badge-text {
		font-family: var(--mcs-font-mono);
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
	}
</style>
