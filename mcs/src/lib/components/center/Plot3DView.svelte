<script lang="ts">
	import type { Plot3DProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { formatValue, SERIES_COLORS } from '$lib/charts/chart-utils.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';
	import { untrack } from 'svelte';

	let { objectId, props } = $props<{ objectId: string; props: Plot3DProps }>();

	const series = $derived(props.series ?? []);
	const pollInterval = $derived(props.pollInterval ?? 4000);
	const WINDOW_SEC = 120;

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(400);

	let azimuth = $state(untrack(() => props.azimuth ?? 30));
	let elevation = $state(untrack(() => props.elevation ?? 22));
	let dragStart = $state<{ x: number; y: number; az: number; el: number } | null>(null);

	type Pt3D = { x: number; y: number; z: number };
	let allData = $state<Pt3D[][]>([]);

	function fetchData() {
		allData = series.map((s: any) => {
			const xSeries =
				s.xSource && isSampleStreamId(s.xSource)
					? getSampleStreamSeries(s.xSource, { windowSec: WINDOW_SEC, points: 80 })
					: [];
			const ySeries =
				s.ySource && isSampleStreamId(s.ySource)
					? getSampleStreamSeries(s.ySource, { windowSec: WINDOW_SEC, points: 80 })
					: [];
			const zSeries =
				s.zSource && isSampleStreamId(s.zSource)
					? getSampleStreamSeries(s.zSource, { windowSec: WINDOW_SEC, points: 80 })
					: null;

			const len = Math.min(xSeries.length, ySeries.length);
			return Array.from({ length: len }, (_, i) => ({
				x: xSeries[i].value,
				y: ySeries[i].value,
				z: zSeries ? (zSeries[Math.min(i, zSeries.length - 1)]?.value ?? 0) : 0
			}));
		});
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
				h = r.height || 400;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Compute combined data bounds
	const allFlat = $derived(allData.flat());
	const xMin = $derived(allFlat.length ? Math.min(...allFlat.map((p) => p.x)) : 0);
	const xMax = $derived(allFlat.length ? Math.max(...allFlat.map((p) => p.x)) : 100);
	const yMin = $derived(allFlat.length ? Math.min(...allFlat.map((p) => p.y)) : 0);
	const yMax = $derived(allFlat.length ? Math.max(...allFlat.map((p) => p.y)) : 100);
	const zMin = $derived(allFlat.length ? Math.min(...allFlat.map((p) => p.z)) : 0);
	const zMax = $derived(allFlat.length ? Math.max(...allFlat.map((p) => p.z)) : 100);

	// Normalize [0..1] with a small pad
	function norm(v: number, lo: number, hi: number): number {
		const rng = hi - lo || 1;
		return (v - lo) / rng;
	}

	// 3D → 2D isometric-style projection
	// Cx/Cy: canvas center; scale: radius of the 3D unit cube projection
	function project(nx: number, ny: number, nz: number): { sx: number; sy: number; depth: number } {
		const azRad = (azimuth * Math.PI) / 180;
		const elRad = (elevation * Math.PI) / 180;

		// World coords in [-0.5, 0.5]
		const wx = nx - 0.5;
		const wy = ny - 0.5;
		const wz = nz - 0.5;

		// Rotate around Z (azimuth)
		const rx = Math.cos(azRad) * wx - Math.sin(azRad) * wy;
		const ry = Math.sin(azRad) * wx + Math.cos(azRad) * wy;
		const rz = wz;

		// Project (isometric with elevation tilt)
		const scale = Math.min(w, h) * 0.38;
		const sx = w / 2 + rx * scale;
		const sy = h / 2 - (-Math.sin(elRad) * ry + Math.cos(elRad) * rz) * scale;
		const depth = ry; // used for painter's sort

		return { sx, sy, depth };
	}

	// Axis endpoints (unit cube corners) for drawing axes
	const AXES = $derived([
		{ from: [0, 0, 0], to: [1, 0, 0], color: '#ef4444', label: props.xAxis?.label ?? 'X' },
		{ from: [0, 0, 0], to: [0, 1, 0], color: '#22c55e', label: props.yAxis?.label ?? 'Y' },
		{ from: [0, 0, 0], to: [0, 0, 1], color: '#3b82f6', label: props.zAxis?.label ?? 'Z' }
	]);

	// Grid floor (xy plane at z=0)
	const GRID_LINES = 4;
	const gridLines = $derived.by(() => {
		const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
		for (let i = 0; i <= GRID_LINES; i++) {
			const f = i / GRID_LINES;
			const p1 = project(f, 0, 0);
			const p2 = project(f, 1, 0);
			const p3 = project(0, f, 0);
			const p4 = project(1, f, 0);
			lines.push({ x1: p1.sx, y1: p1.sy, x2: p2.sx, y2: p2.sy });
			lines.push({ x1: p3.sx, y1: p3.sy, x2: p4.sx, y2: p4.sy });
		}
		return lines;
	});

	// Project all data points and sort by depth (painter's algorithm)
	type Dot = {
		sx: number;
		sy: number;
		depth: number;
		color: string;
		r: number;
		seriesIdx: number;
		ptIdx: number;
	};
	const dots = $derived.by((): Dot[] => {
		const result: Dot[] = [];
		for (let si = 0; si < allData.length; si++) {
			const pts = allData[si];
			const color = series[si]?.color ?? SERIES_COLORS[si % SERIES_COLORS.length];
			const r = series[si]?.markerSize ?? 4;
			for (let pi = 0; pi < pts.length; pi++) {
				const p = pts[pi];
				const { sx, sy, depth } = project(
					norm(p.x, xMin, xMax),
					norm(p.y, yMin, yMax),
					norm(p.z, zMin, zMax)
				);
				result.push({ sx, sy, depth, color, r, seriesIdx: si, ptIdx: pi });
			}
		}
		// Sort from back to front
		result.sort((a, b) => a.depth - b.depth);
		return result;
	});

	const seriesColors = $derived(
		series.map((s: any, i: number) => s.color ?? SERIES_COLORS[i % SERIES_COLORS.length])
	);

	// Mouse drag handlers
	function onMouseDown(e: MouseEvent) {
		dragStart = { x: e.clientX, y: e.clientY, az: azimuth, el: elevation };
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragStart) return;
		const dx = e.clientX - dragStart.x;
		const dy = e.clientY - dragStart.y;
		azimuth = dragStart.az - dx * 0.4;
		elevation = Math.max(-60, Math.min(80, dragStart.el + dy * 0.25));
	}

	function onMouseUp() {
		dragStart = null;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="view-root"
	bind:this={containerEl}
	role="img"
	aria-label="3D scatter plot"
	onmousedown={onMouseDown}
	onmousemove={onMouseMove}
	onmouseup={onMouseUp}
	onmouseleave={onMouseUp}
>
	<ErrorBoundary>
		{#if w > 0 && h > 0}
			<svg width={w} height={h} style="display:block;cursor:{dragStart ? 'grabbing' : 'grab'}">
				<!-- Grid floor -->
				{#each gridLines as gl}
					<line
						x1={gl.x1}
						y1={gl.y1}
						x2={gl.x2}
						y2={gl.y2}
						stroke={props.gridColor ?? 'var(--mcs-border)'}
						stroke-width="0.75"
						opacity="0.5"
					/>
				{/each}

				<!-- Coordinate axes -->
				{#each AXES as ax}
					{@const from = project(ax.from[0], ax.from[1], ax.from[2])}
					{@const to = project(ax.to[0], ax.to[1], ax.to[2])}
					<line
						x1={from.sx}
						y1={from.sy}
						x2={to.sx}
						y2={to.sy}
						stroke={ax.color}
						stroke-width="1.5"
						opacity="0.6"
					/>
					<text x={to.sx} y={to.sy - 6} class="axis-label" text-anchor="middle" fill={ax.color}>
						{ax.label}
					</text>
					<!-- Min/max labels on axes -->
					<text x={from.sx + 4} y={from.sy - 3} class="tick-label" fill={ax.color} opacity="0.5">
						{formatValue(ax.color === '#ef4444' ? xMin : ax.color === '#22c55e' ? yMin : zMin, 0)}
					</text>
					<text x={to.sx + 4} y={to.sy - 3} class="tick-label" fill={ax.color} opacity="0.7">
						{formatValue(ax.color === '#ef4444' ? xMax : ax.color === '#22c55e' ? yMax : zMax, 0)}
					</text>
				{/each}

				<!-- Data dots (painter's sorted) -->
				{#each dots as dot}
					{@const ageIdx = dot.ptIdx / Math.max(1, (allData[dot.seriesIdx]?.length ?? 1) - 1)}
					<circle
						cx={dot.sx}
						cy={dot.sy}
						r={dot.r}
						fill={dot.color}
						opacity={0.3 + ageIdx * 0.55}
						stroke="var(--mcs-bg)"
						stroke-width="0.75"
					/>
				{/each}

				<!-- Legend -->
				{#if series.length > 1}
					{#each series as s, i}
						<circle cx={12} cy={h - 8 - i * 16} r={4} fill={seriesColors[i]} opacity="0.9" />
						<text x={20} y={h - 4 - i * 16} class="legend-label">
							{s.name || `Series ${i + 1}`}
						</text>
					{/each}
				{/if}

				<!-- Drag hint -->
				<text x={w - 4} y={h - 4} class="hint-label" text-anchor="end">drag to rotate</text>
			</svg>

			{#if series.length === 0}
				<div class="empty-state">Add series in properties to display a 3D scatter plot</div>
			{/if}
		{/if}
	</ErrorBoundary>
</div>

<style>
	.view-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
		position: relative;
		user-select: none;
	}

	.axis-label {
		font-family: var(--mcs-font-sans);
		font-size: 10px;
		font-weight: 600;
		pointer-events: none;
	}

	.tick-label {
		font-family: var(--mcs-font-mono);
		font-size: 8.5px;
		pointer-events: none;
	}

	.legend-label {
		font-family: var(--mcs-font-sans);
		font-size: 10px;
		fill: var(--mcs-text-muted);
		pointer-events: none;
	}

	.hint-label {
		font-family: var(--mcs-font-sans);
		font-size: 9px;
		fill: var(--mcs-text-muted);
		opacity: 0.4;
		pointer-events: none;
	}

	.empty-state {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--mcs-font-sans);
		font-size: 12px;
		color: var(--mcs-text-muted);
		padding: 1rem;
		text-align: center;
	}
</style>
