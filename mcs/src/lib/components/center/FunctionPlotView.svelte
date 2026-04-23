<script lang="ts">
	import type { FunctionPlotProps } from '$lib/objects/types.js';
	import { linearScale, niceTicks, buildLinePath, formatValue } from '$lib/charts/chart-utils.js';

	let { objectId, props } = $props<{ objectId: string; props: FunctionPlotProps }>();

	const expression = $derived(props.expression ?? 'sin(t)');
	const sampleCount = $derived(props.sampleCount ?? 200);
	const color = $derived(props.color ?? '#22d3ee');
	const strokeWidth = $derived(props.strokeWidth ?? 2);
	const showGrid = $derived(props.showGrid ?? true);
	const yAxisLabel = $derived(props.yAxisLabel ?? '');
	const yMin = $derived(props.yMin);
	const yMax = $derived(props.yMax);

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);

	const ML = $derived(w < 200 ? Math.max(20, w * 0.2) : 54);
	const MR = $derived(w < 200 ? 6 : 14);
	const MT = $derived(h < 150 ? 4 : 10);
	const MB = $derived(h < 150 ? Math.max(16, h * 0.15) : 38);
	const pw = $derived(Math.max(10, w - ML - MR));
	const ph = $derived(Math.max(10, h - MT - MB));

	// Evaluate expression for a range of t values (0..120 "window" by default)
	const WINDOW = 120;

	function evaluateExpression(expr: string, count: number): { t: number; value: number }[] {
		const pts: { t: number; value: number }[] = [];
		const fn = buildMathFn(expr);
		for (let i = 0; i < count; i++) {
			const t = (i / (count - 1)) * WINDOW;
			try {
				const value = fn(t, i);
				if (Number.isFinite(value)) {
					pts.push({ t, value });
				}
			} catch {
				// skip invalid points
			}
		}
		return pts;
	}

	function buildMathFn(expr: string): (t: number, i: number) => number {
		try {
			// Provide common math functions in scope
			const body = `
				const { sin, cos, tan, abs, sqrt, pow, log, exp, floor, ceil, round, min, max, PI, E } = Math;
				const pi = PI;
				const e = E;
				const time = Date.now() / 1000;
				return (${expr});
			`;
			return new Function('t', 'i', body) as (t: number, i: number) => number;
		} catch {
			return () => 0;
		}
	}

	const points = $derived(evaluateExpression(expression, sampleCount));

	const tValues = $derived(points.map((p) => p.t));
	const vValues = $derived(points.map((p) => p.value));

	const tMinVal = $derived(tValues.length ? Math.min(...tValues) : 0);
	const tMaxVal = $derived(tValues.length ? Math.max(...tValues) : WINDOW);

	const rawVMin = $derived(vValues.length ? Math.min(...vValues) : 0);
	const rawVMax = $derived(vValues.length ? Math.max(...vValues) : 1);
	const vMinVal = $derived(yMin !== undefined ? yMin : rawVMin - (rawVMax - rawVMin) * 0.05);
	const vMaxVal = $derived(yMax !== undefined ? yMax : rawVMax + (rawVMax - rawVMin) * 0.05);

	const xTicks = $derived(niceTicks(tMinVal, tMaxVal, 6));
	const yTicks = $derived(niceTicks(vMinVal, vMaxVal, 5));

	const xScale = $derived(linearScale([tMinVal, tMaxVal], [0, pw]));
	const yScale = $derived(linearScale([vMinVal, vMaxVal], [ph, 0]));

	const linePath = $derived(
		points.length > 0
			? buildLinePath(
					points.map((p) => ({
						x: ML + xScale(p.t),
						y: MT + yScale(p.value)
					})),
					'linear'
				)
			: ''
	);

	// Tooltip state
	let hoverX = $state<number | null>(null);
	let hoverPt = $derived.by(() => {
		if (hoverX === null || !points.length) return null;
		const tVal = tMinVal + ((hoverX - ML) / pw) * (tMaxVal - tMinVal);
		let best = points[0];
		let bestDist = Infinity;
		for (const p of points) {
			const d = Math.abs(p.t - tVal);
			if (d < bestDist) {
				bestDist = d;
				best = p;
			}
		}
		return best;
	});

	// ResizeObserver
	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver(([e]) => {
			w = e.contentRect.width || 600;
			h = e.contentRect.height || 300;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	function handleMouseMove(e: MouseEvent) {
		const rect = containerEl?.getBoundingClientRect();
		if (!rect) return;
		const x = e.clientX - rect.left;
		if (x >= ML && x <= ML + pw) {
			hoverX = x;
		} else {
			hoverX = null;
		}
	}
</script>

<div
	class="chart-container view-root"
	bind:this={containerEl}
	role="img"
	aria-label="Function plot: {expression}"
	onmousemove={handleMouseMove}
	onmouseleave={() => (hoverX = null)}
>
	<svg width={w} height={h}>
		{#if showGrid}
			<!-- X grid lines -->
			{#each xTicks as tick}
				{@const x = ML + xScale(tick)}
				<line x1={x} y1={MT} x2={x} y2={MT + ph} stroke="rgba(255,255,255,0.06)" stroke-width="1" />
			{/each}
			<!-- Y grid lines -->
			{#each yTicks as tick}
				{@const y = MT + yScale(tick)}
				<line x1={ML} y1={y} x2={ML + pw} y2={y} stroke="rgba(255,255,255,0.06)" stroke-width="1" />
			{/each}
		{/if}

		<!-- Axes -->
		<line x1={ML} y1={MT} x2={ML} y2={MT + ph} stroke="rgba(255,255,255,0.2)" stroke-width="1" />
		<line
			x1={ML}
			y1={MT + ph}
			x2={ML + pw}
			y2={MT + ph}
			stroke="rgba(255,255,255,0.2)"
			stroke-width="1"
		/>

		<!-- X axis labels -->
		{#each xTicks as tick}
			{@const x = ML + xScale(tick)}
			<text {x} y={MT + ph + 16} fill="rgba(255,255,255,0.5)" font-size="10" text-anchor="middle">
				{tick.toFixed(0)}s
			</text>
		{/each}

		<!-- Y axis labels -->
		{#each yTicks as tick}
			{@const y = MT + yScale(tick)}
			<text x={ML - 6} y={y + 3} fill="rgba(255,255,255,0.5)" font-size="10" text-anchor="end">
				{formatValue(tick)}
			</text>
		{/each}

		<!-- Y axis label -->
		{#if yAxisLabel}
			<text
				x={14}
				y={MT + ph / 2}
				fill="rgba(255,255,255,0.4)"
				font-size="11"
				text-anchor="middle"
				transform="rotate(-90, 14, {MT + ph / 2})"
			>
				{yAxisLabel}
			</text>
		{/if}

		<!-- Function curve -->
		{#if linePath}
			<path
				d={linePath}
				fill="none"
				stroke={color}
				stroke-width={strokeWidth}
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}

		<!-- Hover crosshair -->
		{#if hoverPt && hoverX !== null}
			{@const cx = ML + xScale(hoverPt.t)}
			{@const cy = MT + yScale(hoverPt.value)}
			<line
				x1={cx}
				y1={MT}
				x2={cx}
				y2={MT + ph}
				stroke="rgba(255,255,255,0.15)"
				stroke-width="1"
				stroke-dasharray="3,3"
			/>
			<circle {cx} {cy} r="4" fill={color} stroke="#111" stroke-width="1.5" />
		{/if}
	</svg>

	<!-- Tooltip -->
	{#if hoverPt}
		<div
			class="tooltip"
			style:left="{ML + xScale(hoverPt.t)}px"
			style:top="{MT + yScale(hoverPt.value) - 32}px"
		>
			t={hoverPt.t.toFixed(1)}s &nbsp; y={formatValue(hoverPt.value)}
		</div>
	{/if}

	<!-- Expression label -->
	<div class="expr-label">f(t) = {expression}</div>
</div>

<style>
	.chart-container {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.15);
		border-radius: 6px;
	}
	.chart-container svg {
		display: block;
	}
	.tooltip {
		position: absolute;
		pointer-events: none;
		background: rgba(20, 20, 30, 0.92);
		color: rgba(255, 255, 255, 0.85);
		padding: 3px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-family: var(--font-mono, monospace);
		white-space: nowrap;
		transform: translateX(-50%);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}
	.expr-label {
		position: absolute;
		top: 8px;
		right: 12px;
		font-size: 11px;
		font-family: var(--font-mono, monospace);
		color: rgba(255, 255, 255, 0.35);
		pointer-events: none;
	}
</style>
