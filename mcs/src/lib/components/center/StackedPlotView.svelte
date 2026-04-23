<script lang="ts">
	import type { StackedPlotProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
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

	let { objectId, props } = $props<{ objectId: string; props: StackedPlotProps }>();

	const series = $derived(props.series ?? []);
	const showGrid = $derived(props.showGrid ?? true);
	const pollInterval = $derived(props.pollInterval ?? 5000);

	const WINDOW_SEC = 120;

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(400);

	const ML = 54,
		MR = 14,
		MT = 8,
		MB = 36;
	const PANEL_GAP = 4;
	const pw = $derived(Math.max(10, w - ML - MR));
	const totalPH = $derived(Math.max(10, h - MT - MB));
	const numSeries = $derived(Math.max(1, series.length));
	const panelH = $derived(
		Math.max(20, Math.floor((totalPH - PANEL_GAP * (numSeries - 1)) / numSeries))
	);

	type Pt = { timestamp: number; value: number };
	let allSeries = $state<Pt[][]>([]);

	function fetchData() {
		allSeries = series.map((s: (typeof series)[0]) =>
			s.dataSource && isSampleStreamId(s.dataSource)
				? getSampleStreamSeries(s.dataSource, { windowSec: WINDOW_SEC, points: 150 })
				: []
		);
	}

	// Shared X domain across all series
	const allPts = $derived(allSeries.flat());
	const tMin = $derived(
		allPts.length ? Math.min(...allPts.map((p) => p.timestamp)) : Date.now() / 1000 - WINDOW_SEC
	);
	const tMax = $derived(
		allPts.length ? Math.max(...allPts.map((p) => p.timestamp)) : Date.now() / 1000
	);

	const xScale = $derived(linearScale([tMin, tMax], [0, pw]));
	const xTicks = $derived(niceTicks(tMin, tMax, Math.max(2, Math.floor(pw / 90))));

	// Per-panel Y scales and paths
	const panelData = $derived(
		series.map((s: (typeof series)[0], i: number) => {
			const serPts = allSeries[i] ?? [];
			const rawMin = serPts.length ? Math.min(...serPts.map((p) => p.value)) : 0;
			const rawMax = serPts.length ? Math.max(...serPts.map((p) => p.value)) : 100;
			const pad = (rawMax - rawMin) * 0.08 || 1;
			const yMin = rawMin - pad;
			const yMax = rawMax + pad;
			const yScale = linearScale([yMin, yMax], [panelH, 0]);
			const yTicks = niceTicks(yMin, yMax, Math.max(2, Math.floor(panelH / 28)));
			const path = buildLinePath(
				serPts.map((p) => ({ x: xScale(p.timestamp), y: yScale(p.value) })),
				(s.interpolation ?? 'linear') as 'linear' | 'step' | 'smooth' | 'basis'
			);
			const color = s.color || SERIES_COLORS[i % SERIES_COLORS.length];
			const panelY = MT + i * (panelH + PANEL_GAP);
			return { serPts, yScale, yTicks, path, color, panelY, yMin, yMax };
		})
	);

	// Hover
	let hoverX = $state<number | null>(null);
	const hoverTimestamp = $derived(hoverX !== null ? tMin + (hoverX / pw) * (tMax - tMin) : null);

	function onPointerMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
		const x = e.clientX - rect.left;
		hoverX = x >= 0 && x <= pw ? x : null;
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
				h = r.height || 400;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});
</script>

<div class="view-root" bind:this={containerEl}>
	<ErrorBoundary>
		{#if w > 0 && h > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg width={w} height={h} style="display:block;overflow:visible;cursor:crosshair">
				<!-- Transparent hitbox to drive hover -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<rect
					x={ML}
					y={MT}
					width={pw}
					height={totalPH}
					fill="transparent"
					onpointermove={onPointerMove}
					onpointerleave={onPointerLeave}
				/>

				<!-- Per-panel clips -->
				<defs>
					{#each panelData as panel, i}
						<clipPath id="sp-clip-{objectId}-{i}">
							<rect x={0} y={0} width={pw} height={panelH} />
						</clipPath>
					{/each}
				</defs>

				{#each panelData as panel, i}
					{@const s = series[i]}
					<g transform="translate({ML},{panel.panelY})">
						<!-- Panel background -->
						<rect x={0} y={0} width={pw} height={panelH} class="panel-bg" />

						<!-- Grid lines -->
						{#if showGrid}
							{#each xTicks as tx}
								{@const lx = xScale(tx)}
								{#if lx >= 0 && lx <= pw}
									<line x1={lx} y1={0} x2={lx} y2={panelH} class="grid-line" />
								{/if}
							{/each}
							{#each panel.yTicks as ty}
								{@const ly = panel.yScale(ty)}
								{#if ly >= 0 && ly <= panelH}
									<line x1={0} y1={ly} x2={pw} y2={ly} class="grid-line" />
								{/if}
							{/each}
						{/if}

						<!-- Series line (clipped) -->
						<g clip-path="url(#sp-clip-{objectId}-{i})">
							{#if panel.path}
								<path
									d={panel.path}
									fill="none"
									stroke={panel.color}
									stroke-width="1.5"
									stroke-linejoin="round"
									stroke-linecap="round"
									opacity="0.9"
								/>
							{/if}

							<!-- Hover crosshair -->
							{#if hoverX !== null && hoverTimestamp !== null}
								<line x1={hoverX} y1={0} x2={hoverX} y2={panelH} class="crosshair" />
								{@const idx = nearestByX(panel.serPts, hoverTimestamp)}
								{#if idx >= 0}
									{@const cy = panel.yScale(panel.serPts[idx].value)}
									{#if cy >= -4 && cy <= panelH + 4}
										<circle
											cx={hoverX}
											{cy}
											r={4}
											fill={panel.color}
											stroke="var(--mcs-bg)"
											stroke-width="2"
										/>
									{/if}
								{/if}
							{/if}
						</g>

						<!-- Panel border -->
						<rect x={0} y={0} width={pw} height={panelH} fill="none" class="plot-border" />

						<!-- Y axis -->
						<line x1={0} y1={0} x2={0} y2={panelH} class="axis-line" />
						{#each panel.yTicks as ty}
							{@const ly = panel.yScale(ty)}
							{#if ly >= 0 && ly <= panelH}
								<text x={-6} y={ly + 4} class="axis-label" text-anchor="end">
									{formatValue(ty, Math.abs(ty) < 10 ? 2 : 1)}
								</text>
							{/if}
						{/each}

						<!-- Series name label (left margin) -->
						<text
							x={-(ML - 12)}
							y={panelH / 2}
							class="series-label"
							text-anchor="middle"
							transform="rotate(-90, {-(ML - 12)}, {panelH / 2})"
							fill={panel.color}
						>
							{s.name || s.dataSource || `Series ${i + 1}`}
						</text>

						<!-- Value badge for hovered position -->
						{#if hoverX !== null && hoverTimestamp !== null}
							{@const idx = nearestByX(panel.serPts, hoverTimestamp)}
							{#if idx >= 0}
								{@const val = panel.serPts[idx].value}
								<text x={4} y={11} class="panel-val-badge" fill={panel.color}>
									{formatValue(val, 2)}
								</text>
							{/if}
						{/if}
					</g>
				{/each}

				<!-- X axis (shared, at bottom of last panel) -->
				{#if panelData.length}
					{@const lastPanel = panelData[panelData.length - 1]}
					{@const xAxisY = lastPanel.panelY + panelH}
					<g transform="translate({ML},{xAxisY})">
						<line x1={0} y1={0} x2={pw} y2={0} class="axis-line" />
						{#each xTicks as tx}
							{@const lx = xScale(tx)}
							{#if lx >= 0 && lx <= pw}
								<text x={lx} y={15} class="axis-label" text-anchor="middle">
									{formatTimestamp(tx, tMax - tMin)}
								</text>
							{/if}
						{/each}
						{#if props.xAxis?.label}
							<text x={pw / 2} y={30} class="axis-title" text-anchor="middle">
								{props.xAxis.label}
							</text>
						{/if}
					</g>
				{/if}

				<!-- Hover timestamp badge -->
				{#if hoverX !== null && hoverTimestamp !== null}
					{@const bx = hoverX + ML}
					{@const by = h - MB + 20}
					<text x={bx} y={by} class="hover-timestamp" text-anchor="middle">
						{formatTimestamp(hoverTimestamp, tMax - tMin)}
					</text>
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

	.panel-bg {
		fill: var(--mcs-surface);
		opacity: 0.3;
	}

	.grid-line {
		stroke: var(--mcs-border);
		stroke-width: 1;
		stroke-dasharray: 3 4;
		opacity: 0.55;
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
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
	}

	.axis-title {
		font-family: var(--mcs-font-sans);
		font-size: 10.5px;
		fill: var(--mcs-text-muted);
	}

	.series-label {
		font-family: var(--mcs-font-sans);
		font-size: 9.5px;
		font-weight: 500;
		opacity: 0.85;
	}

	.crosshair {
		stroke: var(--mcs-text-muted);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0.55;
		pointer-events: none;
	}

	.panel-val-badge {
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		font-weight: 600;
		opacity: 0.9;
	}

	.hover-timestamp {
		font-family: var(--mcs-font-mono);
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
		opacity: 0.8;
	}
</style>
