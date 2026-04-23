<script lang="ts">
	import type { BarChartProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import {
		linearScale,
		niceTicks,
		formatValue,
		formatTimestamp,
		SERIES_COLORS
	} from '$lib/charts/chart-utils.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: BarChartProps }>();

	const dataSource = $derived((props as any).dataSources?.[0] ?? props.dataSource ?? '');
	const orientation = $derived(props.orientation ?? 'vertical');
	const showGrid = $derived((props as any).showGrid !== false);
	const colors = $derived(props.colors?.length ? props.colors : [...SERIES_COLORS]);
	const pollInterval = $derived(props.pollInterval ?? 5000);

	const BAR_POINTS = 20; // number of bars to show
	const WINDOW_SEC = 60;

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);

	const isVert = $derived(orientation !== 'horizontal');

	// Margins
	const ML = $derived(isVert ? 50 : 12);
	const MR = $derived(isVert ? 12 : 52);
	const MT = 10;
	const MB = $derived(isVert ? 36 : 10);

	const pw = $derived(Math.max(10, w - (isVert ? 50 : 12) - (isVert ? 12 : 52)));
	const ph = $derived(Math.max(10, h - MT - (isVert ? 36 : 10)));

	type Pt = { timestamp: number; value: number };
	let data = $state<Pt[]>([]);

	function fetchData() {
		if (!dataSource) {
			data = [];
			return;
		}
		if (isSampleStreamId(dataSource)) {
			data = getSampleStreamSeries(dataSource, { windowSec: WINDOW_SEC, points: BAR_POINTS });
		}
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

	// Value domain
	const rawMin = $derived(data.length ? Math.min(0, ...data.map((p) => p.value)) : 0);
	const rawMax = $derived(data.length ? Math.max(...data.map((p) => p.value)) : 100);
	const pad = $derived((rawMax - rawMin) * 0.06 || 1);
	const domMin = $derived(props.yAxis?.min != null ? (props.yAxis.min as number) : rawMin);
	const domMax = $derived(props.yAxis?.max != null ? (props.yAxis.max as number) : rawMax + pad);

	const valTicks = $derived(
		niceTicks(domMin, domMax, Math.max(2, Math.floor((isVert ? ph : pw) / 40)))
	);
	const valScale = $derived(
		isVert ? linearScale([domMin, domMax], [ph, 0]) : linearScale([domMin, domMax], [0, pw])
	);

	// Zero line position
	const zeroPos = $derived(
		isVert ? Math.max(0, Math.min(ph, valScale(0))) : Math.max(0, Math.min(pw, valScale(0)))
	);

	// Bar layout
	const barCount = $derived(data.length || 1);
	const GAP_FRAC = 0.2; // 20% gap between bars
	const barSpan = $derived(isVert ? pw / barCount : ph / barCount);
	const barW = $derived(barSpan * (1 - GAP_FRAC));
	const barGap = $derived(barSpan * GAP_FRAC);

	// Hover state
	let hoveredBar = $state<number | null>(null);

	// Tooltip
	const TOOLTIP_W = 130;
	const TOOLTIP_H = 46;

	function getBarScreenRect(i: number) {
		if (isVert) {
			const x = i * barSpan + barGap / 2;
			const yVal = valScale(data[i].value);
			const yBase = zeroPos;
			return {
				x,
				y: Math.min(yVal, yBase),
				bw: barW,
				bh: Math.abs(yVal - yBase)
			};
		} else {
			const y = i * barSpan + barGap / 2;
			const xVal = valScale(data[i].value);
			const xBase = zeroPos;
			return {
				x: Math.min(xVal, xBase),
				y,
				bw: Math.abs(xVal - xBase),
				bh: barW
			};
		}
	}

	function onPointerMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		if (mx < 0 || mx > pw || my < 0 || my > ph) {
			hoveredBar = null;
			return;
		}
		// Find hovered bar and verify mouse is within actual bar bounds
		const idx = Math.floor(isVert ? (mx / pw) * barCount : (my / ph) * barCount);
		if (idx >= 0 && idx < data.length) {
			const br = getBarScreenRect(idx);
			hoveredBar =
				mx >= br.x && mx <= br.x + br.bw && my >= br.y && my <= br.y + br.bh ? idx : null;
		} else {
			hoveredBar = null;
		}
	}

	function onPointerLeave() {
		hoveredBar = null;
	}

	const clipId = $derived(`bc-clip-${objectId}`);

	// Tooltip position
	const tooltipPos = $derived.by(() => {
		if (hoveredBar === null || hoveredBar >= data.length) return { x: 0, y: 0 };
		const rect = getBarScreenRect(hoveredBar);
		if (isVert) {
			const tx = rect.x + ML + rect.bw / 2 - TOOLTIP_W / 2;
			const ty = MT + rect.y - TOOLTIP_H - 6;
			return {
				x: Math.max(0, Math.min(w - TOOLTIP_W, tx)),
				y: Math.max(0, ty)
			};
		} else {
			const tx = ML + rect.x + rect.bw + 6;
			const ty = MT + rect.y + rect.bh / 2 - TOOLTIP_H / 2;
			return {
				x: Math.min(w - TOOLTIP_W - 4, tx),
				y: Math.max(0, ty)
			};
		}
	});
</script>

<div class="view-root" bind:this={containerEl}>
	<ErrorBoundary>
		{#if w > 0 && h > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg width={w} height={h} style="display:block;overflow:visible;cursor:default">
				<defs>
					<clipPath id={clipId}>
						<rect x={0} y={0} width={pw} height={ph} />
					</clipPath>
				</defs>

				<g transform="translate({isVert ? 50 : 12},{MT})">
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

					<!-- Grid lines -->
					{#if showGrid}
						{#each valTicks as tv}
							{@const pos = valScale(tv)}
							{#if isVert}
								{#if pos >= 0 && pos <= ph}
									<line x1={0} y1={pos} x2={pw} y2={pos} class="grid-line" />
								{/if}
							{:else if pos >= 0 && pos <= pw}
								<line x1={pos} y1={0} x2={pos} y2={ph} class="grid-line" />
							{/if}
						{/each}
					{/if}

					<!-- Zero baseline -->
					{#if isVert}
						<line x1={0} y1={zeroPos} x2={pw} y2={zeroPos} class="zero-line" />
					{:else}
						<line x1={zeroPos} y1={0} x2={zeroPos} y2={ph} class="zero-line" />
					{/if}

					<rect x={0} y={0} width={pw} height={ph} fill="none" class="plot-border" />

					<g clip-path="url(#{clipId})">
						<!-- Bars -->
						{#each data as pt, i}
							{@const r = getBarScreenRect(i)}
							{@const isNeg = pt.value < 0}
							{@const hovered = hoveredBar === i}
							<rect
								x={r.x}
								y={r.y}
								width={r.bw}
								height={Math.max(1, r.bh)}
								fill={isNeg ? '#ef4444' : colors[0]}
								opacity={hovered ? 1 : 0.75}
								rx={2}
							/>
						{/each}
					</g>

					<!-- Value axis (Y for vertical, X for horizontal) -->
					{#if isVert}
						<line x1={0} y1={0} x2={0} y2={ph} class="axis-line" />
						{#each valTicks as tv}
							{@const pos = valScale(tv)}
							{#if pos >= 0 && pos <= ph}
								<text x={-6} y={pos + 4} class="axis-label" text-anchor="end">
									{formatValue(tv, 0)}
								</text>
							{/if}
						{/each}
						{#if props.yAxis?.label}
							<text
								x={-38}
								y={ph / 2}
								class="axis-title"
								text-anchor="middle"
								transform="rotate(-90, -38, {ph / 2})"
							>
								{props.yAxis.label}
							</text>
						{/if}
					{:else}
						<line x1={0} y1={ph} x2={pw} y2={ph} class="axis-line" />
						{#each valTicks as tv}
							{@const pos = valScale(tv)}
							{#if pos >= 0 && pos <= pw}
								<text x={pos} y={ph + 14} class="axis-label" text-anchor="middle">
									{formatValue(tv, 0)}
								</text>
							{/if}
						{/each}
						{#if props.xAxis?.label}
							<text x={pw / 2} y={ph + 28} class="axis-title" text-anchor="middle">
								{props.xAxis.label}
							</text>
						{/if}
					{/if}

					<!-- Category axis labels (time) -->
					{#if isVert && data.length}
						<line x1={0} y1={ph} x2={pw} y2={ph} class="axis-line" />
						{#each data as pt, i}
							{@const x = i * barSpan + barSpan / 2}
							<!-- Only label every Nth bar to avoid crowding -->
							{#if data.length <= 10 || i % Math.ceil(data.length / 10) === 0}
								<text {x} y={ph + 14} class="axis-label" text-anchor="middle">
									{formatTimestamp(pt.timestamp, WINDOW_SEC)}
								</text>
							{/if}
						{/each}
						{#if props.xAxis?.label}
							<text x={pw / 2} y={ph + 30} class="axis-title" text-anchor="middle">
								{props.xAxis.label}
							</text>
						{/if}
					{:else if !isVert && data.length}
						<line x1={0} y1={0} x2={0} y2={ph} class="axis-line" />
						{#each data as pt, i}
							{@const y = i * barSpan + barSpan / 2}
							{#if data.length <= 10 || i % Math.ceil(data.length / 10) === 0}
								<text x={-6} y={y + 4} class="axis-label" text-anchor="end">
									{formatTimestamp(pt.timestamp, WINDOW_SEC)}
								</text>
							{/if}
						{/each}
					{/if}
				</g>

				<!-- Hover tooltip -->
				{#if hoveredBar !== null && hoveredBar < data.length}
					{@const pt = data[hoveredBar]}
					<g class="tooltip" transform="translate({tooltipPos.x},{tooltipPos.y})">
						<rect x={0} y={0} width={TOOLTIP_W} height={TOOLTIP_H} rx={4} class="tooltip-bg" />
						<text x={8} y={15} class="tooltip-time">
							{formatTimestamp(pt.timestamp, WINDOW_SEC)}
						</text>
						<text x={8} y={32} class="tooltip-label">{props.yAxis?.label ?? 'Value'}</text>
						<text x={TOOLTIP_W - 8} y={32} class="tooltip-value" text-anchor="end">
							{formatValue(pt.value, 2)}
						</text>
					</g>
				{/if}
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
		opacity: 0.6;
	}

	.zero-line {
		stroke: var(--mcs-border);
		stroke-width: 1.5;
		opacity: 0.8;
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
</style>
