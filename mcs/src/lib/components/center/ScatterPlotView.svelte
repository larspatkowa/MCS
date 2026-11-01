<script lang="ts">
	import type { ScatterPlotProps } from '$lib/objects/types.js';
	import { linearScale, niceTicks, formatShort } from '$lib/charts/chart-utils.js';
	import { latestAtOrBefore } from '$lib/charts/time-alignment.js';
	import { useStreamTrack, useStreamCatalog } from '$lib/telemetry/live-data.svelte.js';

	let { props } = $props<{ objectId: string; props: ScatterPlotProps }>();

	const xSource = $derived(props.xSource ?? '');
	const ySource = $derived(props.ySource || props.xSource || '');
	const xField = $derived(props.xField || 'value');
	const yField = $derived(props.yField || 'value');
	const windowSec = $derived(props.windowSec ?? 600);

	const xTrack = useStreamTrack(
		() => xSource,
		() => windowSec
	);
	const yTrack = useStreamTrack(
		() => (ySource === xSource ? '' : ySource),
		() => windowSec
	);
	const catalog = useStreamCatalog();

	// Pair each x sample with the y value in force at that time. A single
	// stream carrying both fields pairs within one payload.
	const pairs = $derived.by(() => {
		const ySeries =
			ySource === xSource
				? null
				: yTrack.samples
						.map((sample) => ({
							timestamp: sample.timestamp,
							value: Number(sample.values[yField])
						}))
						.filter((sample) => Number.isFinite(sample.value));
		const out: { x: number; y: number; t: number }[] = [];
		for (const sample of xTrack.samples) {
			const x = Number(sample.values[xField]);
			const y = ySeries
				? latestAtOrBefore(ySeries, sample.timestamp)?.value
				: Number(sample.values[yField]);
			if (Number.isFinite(x) && y !== undefined && Number.isFinite(y))
				out.push({ x, y, t: sample.timestamp });
		}
		return out;
	});

	let width = $state(400);
	let height = $state(300);
	const M = { left: 56, right: 14, top: 12, bottom: 36 };

	function domain(values: number[]): [number, number] {
		if (values.length === 0) return [0, 1];
		let min = Infinity;
		let max = -Infinity;
		for (const value of values) {
			if (value < min) min = value;
			if (value > max) max = value;
		}
		if (min === max) return [min - 1, max + 1];
		const pad = (max - min) * 0.05;
		return [min - pad, max + pad];
	}
	const xDomain = $derived(domain(pairs.map((pair) => pair.x)));
	const yDomain = $derived(domain(pairs.map((pair) => pair.y)));
	const xScale = $derived(linearScale(xDomain, [M.left, width - M.right]));
	const yScale = $derived(linearScale(yDomain, [height - M.bottom, M.top]));
	const xTicks = $derived(niceTicks(xDomain[0], xDomain[1], Math.max(2, Math.floor(width / 90))));
	const yTicks = $derived(niceTicks(yDomain[0], yDomain[1], Math.max(2, Math.floor(height / 50))));

	const path = $derived(
		pairs.map((pair, i) => `${i ? 'L' : 'M'}${xScale(pair.x)},${yScale(pair.y)}`).join('')
	);
	const newest = $derived(pairs.at(-1));
	// Thousands of SVG circles stall layout; the trail still uses every pair.
	const MAX_POINTS = 2_000;
	const shown = $derived(
		pairs.length <= MAX_POINTS
			? pairs
			: pairs.filter((_, i) => i % Math.ceil(pairs.length / MAX_POINTS) === 0)
	);

	function axisLabel(label: string | undefined, source: string, field: string): string {
		if (label) return label;
		const unit = catalog.unitFor(source, field);
		const name = field === 'value' ? catalog.nameFor(source) : field;
		return unit ? `${name} (${unit})` : name;
	}
</script>

<div class="sp-root" bind:clientWidth={width} bind:clientHeight={height}>
	{#if !xSource}
		<p class="empty">Choose X and Y streams and fields in the properties panel.</p>
	{:else}
		<svg {width} {height} role="img" aria-label="Scatter plot">
			{#each yTicks as tick (tick)}
				<line class="grid" x1={M.left} x2={width - M.right} y1={yScale(tick)} y2={yScale(tick)} />
				<text
					class="tick"
					x={M.left - 6}
					y={yScale(tick)}
					text-anchor="end"
					dominant-baseline="middle">{formatShort(tick)}</text
				>
			{/each}
			{#each xTicks as tick (tick)}
				<line class="grid" y1={M.top} y2={height - M.bottom} x1={xScale(tick)} x2={xScale(tick)} />
				<text class="tick" x={xScale(tick)} y={height - M.bottom + 14} text-anchor="middle"
					>{formatShort(tick)}</text
				>
			{/each}
			<text class="title" x={(M.left + width - M.right) / 2} y={height - 4} text-anchor="middle"
				>{axisLabel(props.xLabel, xSource, xField)}</text
			>
			<text
				class="title"
				transform="translate(12 {(M.top + height - M.bottom) / 2}) rotate(-90)"
				text-anchor="middle">{axisLabel(props.yLabel, ySource, yField)}</text
			>
			{#if props.connect !== false && path}<path class="trail" d={path} />{/if}
			{#each shown as pair, i (i)}
				<circle class="point" cx={xScale(pair.x)} cy={yScale(pair.y)} r="2" />
			{/each}
			{#if newest}
				<circle class="newest" cx={xScale(newest.x)} cy={yScale(newest.y)} r="4.5" />
			{/if}
		</svg>
		{#if pairs.length === 0}
			<p class="overlay">{xTrack.error || yTrack.error || 'No samples in the time window'}</p>
		{/if}
	{/if}
</div>

<style>
	.sp-root {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	svg {
		display: block;
	}
	.grid {
		stroke: color-mix(in srgb, var(--mcs-border) 60%, transparent);
	}
	.tick {
		fill: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
		font-size: 10px;
	}
	.title {
		fill: var(--mcs-text-muted);
		font-family: var(--mcs-font-sans);
		font-size: 11px;
	}
	.trail {
		fill: none;
		stroke: color-mix(in srgb, var(--mcs-series-1) 35%, transparent);
		stroke-width: 1;
	}
	.point {
		fill: var(--mcs-series-1);
		opacity: 0.7;
	}
	.newest {
		fill: var(--mcs-series-1);
		stroke: var(--mcs-bg);
		stroke-width: 2;
	}
	.empty,
	.overlay {
		margin: 0;
		padding: 1rem;
		color: var(--mcs-text-muted);
		font-size: 12px;
		text-align: center;
	}
	.overlay {
		position: absolute;
		inset: 40% 0 auto 0;
	}
</style>
