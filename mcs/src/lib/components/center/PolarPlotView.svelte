<script lang="ts">
	import type { PolarPlotProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { SERIES_COLORS, formatValue } from '$lib/charts/chart-utils.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: PolarPlotProps }>();

	const series = $derived(props.series ?? []);
	const rMinProp = $derived(props.rMin ?? 0);
	const gridRings = $derived(props.gridRings ?? 5);
	const angleStep = $derived(props.angleStep ?? 30);
	const angleLabels = $derived(props.angleLabels ?? 'degrees');
	const showDots = $derived(props.showDots !== false);
	const showLine = $derived(props.showLine !== false);
	const windowSec = $derived(props.windowSec ?? 60);
	const nPoints = $derived(props.pointsPerSeries ?? 300);
	const pollMs = $derived(props.pollInterval ?? 1500);

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(400);
	let h = $state(400);

	type PtPair = { theta: number; r: number };
	let seriesData = $state<PtPair[][]>([]);

	function fetchAll() {
		seriesData = series.map((s: any) => {
			const opts = { windowSec, points: nPoints };
			const thetaSeries = isSampleStreamId(s.thetaSource ?? '')
				? getSampleStreamSeries(s.thetaSource, opts)
				: [];
			const rSeries = isSampleStreamId(s.rSource ?? '')
				? getSampleStreamSeries(s.rSource, opts)
				: [];
			const len = Math.min(thetaSeries.length, rSeries.length);
			const toRad =
				(s.thetaUnit ?? 'radians') === 'degrees'
					? (v: number) => (v * Math.PI) / 180
					: (v: number) => v;
			return Array.from({ length: len }, (_, i) => ({
				theta: toRad(thetaSeries[i].value),
				r: rSeries[i].value
			}));
		});
	}

	$effect(() => {
		fetchAll();
		const id = setInterval(fetchAll, pollMs);
		return () => clearInterval(id);
	});

	$effect(() => {
		const el = containerEl;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) {
				w = rect.width || 400;
				h = rect.height || 400;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	const PAD = 44;
	const cx = $derived(w / 2);
	const cy = $derived(h / 2);
	const R = $derived(Math.max(20, Math.min(cx, cy) - PAD));

	const rMaxAuto = $derived.by(() => {
		let m = 1;
		for (const pts of seriesData) for (const p of pts) if (p.r > m) m = p.r;
		return m * 1.1;
	});
	const rMax = $derived(props.rMax ?? rMaxAuto);
	const rMin = $derived(rMinProp);

	function rToPlot(r: number): number {
		return Math.max(0, (r - rMin) / (rMax - rMin || 1)) * R;
	}

	function polarToXY(theta: number, r: number): [number, number] {
		const pr = rToPlot(r);
		return [cx + pr * Math.cos(theta), cy + pr * Math.sin(theta)];
	}

	const spokes = $derived.by(() => {
		const out: { theta: number; label: string }[] = [];
		const step = (angleStep * Math.PI) / 180;
		const turns = Math.max(1, Math.round((2 * Math.PI) / step));
		for (let i = 0; i < turns; i++) {
			const theta = i * step;
			let label = '';
			if (angleLabels === 'degrees') {
				label = `${Math.round((theta * 180) / Math.PI)}°`;
			} else if (angleLabels === 'radians') {
				const num = Math.round((theta / Math.PI) * 12) / 12;
				label = num === 0 ? '0' : num === 1 ? 'π' : `${num}π`;
			}
			out.push({ theta, label });
		}
		return out;
	});

	const rings = $derived(
		Array.from({ length: gridRings }, (_, i) => {
			const frac = (i + 1) / gridRings;
			return { val: rMin + frac * (rMax - rMin), plotR: frac * R };
		})
	);

	const seriesPaths = $derived(
		seriesData.map((pts) => {
			if (pts.length === 0) return '';
			return pts
				.map((p, i) => {
					const [x, y] = polarToXY(p.theta, p.r);
					return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
				})
				.join(' ');
		})
	);

	const seriesColors = $derived(
		series.map((s: any, i: number) => s.color ?? SERIES_COLORS[i % SERIES_COLORS.length])
	);
</script>

<div class="view-root" bind:this={containerEl}>
	<ErrorBoundary>
		{#if w > 0 && h > 0}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg width={w} height={h} style="display:block;overflow:visible">
				<!-- Concentric grid rings -->
				{#each rings as ring}
					<circle {cx} {cy} r={ring.plotR} class="grid-ring" />
					<text x={cx + ring.plotR + 3} y={cy - 3} class="ring-label">
						{formatValue(ring.val, ring.val < 10 ? 1 : 0)}
					</text>
				{/each}

				<!-- Radial spokes -->
				{#each spokes as spoke}
					{@const x2 = cx + R * Math.cos(spoke.theta)}
					{@const y2 = cy + R * Math.sin(spoke.theta)}
					{@const lx = cx + (R + 14) * Math.cos(spoke.theta)}
					{@const ly = cy + (R + 14) * Math.sin(spoke.theta)}
					<line x1={cx} y1={cy} {x2} {y2} class="spoke-line" />
					{#if spoke.label}
						<text x={lx} y={ly} class="spoke-label" text-anchor="middle" dominant-baseline="middle">
							{spoke.label}
						</text>
					{/if}
				{/each}

				<!-- Origin -->
				<circle {cx} {cy} r={2} class="origin-dot" />

				<!-- Series -->
				{#each seriesData as pts, si}
					{@const color = seriesColors[si]}
					{#if showLine && seriesPaths[si]}
						<path
							d={seriesPaths[si]}
							fill="none"
							stroke={color}
							stroke-width="1.5"
							stroke-linejoin="round"
							opacity="0.85"
						/>
					{/if}
					{#if showDots}
						{#each pts as p, pi}
							{@const age = pts.length > 1 ? pi / (pts.length - 1) : 1}
							{@const [px, py] = polarToXY(p.theta, p.r)}
							<circle
								cx={px}
								cy={py}
								r={pi === pts.length - 1 ? 4 : 2}
								fill={color}
								opacity={0.3 + age * 0.7}
							/>
						{/each}
						{#if pts.length > 0}
							{@const last = pts[pts.length - 1]}
							{@const [lx, ly] = polarToXY(last.theta, last.r)}
							<circle
								cx={lx}
								cy={ly}
								r={5.5}
								fill="none"
								stroke={color}
								stroke-width="1.5"
								opacity="0.9"
							/>
						{/if}
					{/if}
				{/each}

				<!-- Legend -->
				{#each series as s, i}
					{@const color = seriesColors[i]}
					{@const ly = 14 + i * 16}
					<line x1={8} y1={ly} x2={22} y2={ly} stroke={color} stroke-width="2" />
					<circle cx={15} cy={ly} r={3} fill={color} />
					<text x={26} y={ly} class="legend-label" dominant-baseline="middle">
						{s.name ?? s.rSource}
					</text>
				{/each}
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

	.grid-ring {
		fill: none;
		stroke: var(--mcs-border);
		stroke-width: 1;
		opacity: 0.4;
	}

	.ring-label {
		font-family: var(--mcs-font-mono);
		font-size: 9px;
		fill: var(--mcs-text-muted);
		opacity: 0.6;
	}

	.spoke-line {
		stroke: var(--mcs-border);
		stroke-width: 1;
		opacity: 0.3;
	}

	.spoke-label {
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		fill: var(--mcs-text-muted);
	}

	.origin-dot {
		fill: var(--mcs-text-muted);
		opacity: 0.4;
	}

	.legend-label {
		font-family: var(--mcs-font-sans);
		font-size: 10px;
		fill: var(--mcs-text-muted);
	}
</style>
