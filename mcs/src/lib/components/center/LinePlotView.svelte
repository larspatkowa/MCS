<script lang="ts">
	import type { LinePlotProps } from '$lib/objects/types.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import {
		linearScale,
		niceTicks,
		buildLinePath,
		formatTimestamp,
		formatValue,
		SERIES_COLORS,
		nearestByX,
		splitAtGaps
	} from '$lib/charts/chart-utils.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';
	import { timeConductorState } from '$lib/stores/timeline.js';
	import { replayRunId, replaySamplesForStream } from '$lib/stores/run.js';
	import { replayClock } from '$lib/stores/replay-session.js';
	import { fetchStreamSamples } from '$lib/charts/useStreamData.js';
	import { mergeTimeOrderedSamples } from '$lib/charts/time-alignment.js';

	let { objectId, props } = $props<{ objectId: string; props: LinePlotProps }>();

	// Derived props
	const dataSources = $derived(props.dataSources ?? []);
	const seriesNames = $derived(props.seriesNames ?? []);
	const interpolation = $derived(
		(props.interpolation ?? 'linear') as 'linear' | 'step' | 'smooth' | 'basis'
	);
	const showGrid = $derived(props.showGrid ?? true);
	const colors = $derived(props.colors?.length ? props.colors : [...SERIES_COLORS]);
	const limitBands = $derived(props.limitBands);
	const windowSec = $derived(Math.max(1, Number(props.windowSec) || 30));
	const pollInterval = $derived(
		Math.max(100, Math.min(60_000, Number(props.pollInterval) || 1000))
	);

	// Container
	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);

	let legendH = $state(0);
	const svgH = $derived(Math.max(40, h - legendH));

	// Units come from the plot's own props first, then from stream metadata.
	let streamUnits = $state<Record<string, string>>({});
	const seriesUnits = $derived(
		dataSources.map((src: string, i: number) => props.units?.[i] || streamUnits[src] || '')
	);
	const unitGroups = $derived([...new Set(seriesUnits.filter(Boolean))] as string[]);
	// Series in the first unit (or without a unit) use the left axis; the
	// second unit gets its own right axis so different units never share a scale.
	const seriesAxis = $derived(
		seriesUnits.map((unit: string) => (unit && unitGroups.indexOf(unit) > 0 ? 1 : 0))
	);
	const hasRightAxis = $derived(unitGroups.length > 1);

	// Margins — scale down in small containers
	const ML = $derived(w < 200 ? Math.max(20, w * 0.2) : 54);
	const MR = $derived(hasRightAxis ? ML + 6 : w < 200 ? 6 : 14);
	const MT = $derived(svgH < 150 ? 4 : 10);
	const MB = $derived(svgH < 150 ? Math.max(16, svgH * 0.15) : 38);
	const pw = $derived(Math.max(10, w - ML - MR));
	const ph = $derived(Math.max(10, svgH - MT - MB));

	// Data
	type Pt = { timestamp: number; value: number; eventId?: number };
	let allSeries = $state<Pt[][]>([]);

	// Ring buffer for live SSE streams. Plain object — not $state so
	// SSE callbacks updating it don't cause effect re-runs; fetchData() is called
	// explicitly from the SSE handler instead.
	const LIVE_MAX_PTS = 12_000;
	const LIVE_INCREMENTAL_MAX_PTS = 2_000;
	const MAX_RENDER_PTS = 1_200;
	const liveBuffer: Record<string, Pt[]> = {};
	const latestEventIdBySource: Record<string, number> = {};
	let renderTimer: ReturnType<typeof setTimeout> | null = null;
	let zoomLevel = $state(1);

	function decimate(points: Pt[], maxPoints: number): Pt[] {
		if (points.length <= maxPoints) return points.slice();
		const bucketCount = Math.max(1, Math.floor((maxPoints - 2) / 2));
		const bucketSize = (points.length - 1) / bucketCount;
		const result: Pt[] = [points[0]];
		for (let bucket = 0; bucket < bucketCount; bucket++) {
			const start = Math.floor(bucket * bucketSize);
			const end = Math.min(points.length - 1, Math.floor((bucket + 1) * bucketSize) + 1);
			if (end <= start) continue;
			let min = points[start];
			let max = points[start];
			for (let index = start + 1; index < end; index++) {
				if (points[index].value < min.value) min = points[index];
				if (points[index].value > max.value) max = points[index];
			}
			if (min.timestamp <= max.timestamp) result.push(min, max);
			else result.push(max, min);
		}
		result.push(points[points.length - 1]);
		return result;
	}

	function fetchData() {
		const runReplayActive = Boolean($replayRunId);
		allSeries = dataSources.map((src: string) => {
			if (runReplayActive) {
				const replayPoints = replaySamplesForStream(src, { to: $replayClock.playhead }) ?? [];
				// Saved runs can hold far more samples than the plot has pixels.
				return decimate(
					replayPoints.map((point) => ({ timestamp: point.timestamp, value: point.value })),
					MAX_RENDER_PTS
				);
			}
			const history = liveBuffer[src] ?? [];
			const visible =
				$replayClock.mode !== 'live'
					? history.filter((point) => point.timestamp <= $replayClock.playhead)
					: history;
			return decimate(visible, MAX_RENDER_PTS);
		});
	}

	function scheduleFetchData() {
		if (renderTimer !== null) return;
		renderTimer = setTimeout(() => {
			renderTimer = null;
			fetchData();
		}, 50);
	}

	function numericValue(values: Record<string, unknown>): number {
		if (values.value !== undefined) return Number(values.value);
		return (
			Object.values(values)
				.map(Number)
				.find((value) => !isNaN(value)) ?? NaN
		);
	}

	async function refreshLiveBuffers(
		projectId: string,
		sources: string[],
		signal: AbortSignal
	): Promise<void> {
		if (sources.length === 0) return;
		try {
			const results = await Promise.all(
				sources.map(async (source) => {
					const existing = liveBuffer[source] ?? [];
					const afterEventId = latestEventIdBySource[source];
					const points = (
						await fetchStreamSamples(projectId, source, {
							afterEventId,
							includeEventIds: afterEventId === undefined,
							limit: afterEventId === undefined ? LIVE_MAX_PTS : LIVE_INCREMENTAL_MAX_PTS
						})
					)
						.map((sample) => ({
							timestamp: sample.timestamp,
							value: typeof sample.value === 'number' ? sample.value : NaN,
							...(sample.eventId === undefined ? {} : { eventId: sample.eventId })
						}))
						.filter((point) => !isNaN(point.value));
					return { source, points, existing };
				})
			);

			for (const { source, points, existing } of results) {
				// Merge by source event ID so late samples and SSE/REST overlap remain
				// deterministic even when event time moves backwards.
				const current = liveBuffer[source] ?? existing;
				liveBuffer[source] = mergeTimeOrderedSamples(current, points, LIVE_MAX_PTS);
				for (const point of points) {
					if (point.eventId !== undefined) {
						latestEventIdBySource[source] = Math.max(
							latestEventIdBySource[source] ?? 0,
							point.eventId
						);
					}
				}
			}
			if (!signal.aborted) fetchData();
		} catch {
			// The stream remains live through SSE if a refresh is unavailable.
		}
	}

	// Domain computation
	const allPts = $derived(allSeries.flat());
	const emptyRangeStart = $derived(
		$timeConductorState.mode === 'fixed'
			? $timeConductorState.fixedStart
			: Date.now() / 1000 - windowSec
	);
	const emptyRangeEnd = $derived(
		$timeConductorState.mode === 'fixed' ? $timeConductorState.fixedEnd : Date.now() / 1000
	);
	const liveLatest = $derived(
		allPts.reduce((latest, point) => (point.timestamp > latest ? point.timestamp : latest), 0)
	);
	const tMin = $derived(
		$timeConductorState.mode === 'fixed'
			? $timeConductorState.fixedStart
			: allPts.length
				? liveLatest - Math.max(0.25, windowSec / zoomLevel)
				: emptyRangeStart
	);
	const tMax = $derived(
		$timeConductorState.mode === 'fixed'
			? $timeConductorState.fixedEnd
			: allPts.length
				? liveLatest
				: emptyRangeEnd
	);
	function axisRange(axis: 0 | 1): [number, number] {
		const pts = allSeries.filter((_, i) => (seriesAxis[i] ?? 0) === axis).flat();
		const visible = pts.filter((point) => point.timestamp >= tMin && point.timestamp <= tMax);
		const range = visible.length ? visible : pts;
		if (!range.length) return [0, 100];
		let lo = Infinity;
		let hi = -Infinity;
		for (const point of range) {
			if (point.value < lo) lo = point.value;
			if (point.value > hi) hi = point.value;
		}
		return [lo, hi];
	}
	const leftRange = $derived(axisRange(0));
	const rawValueMin = $derived(leftRange[0]);
	const rawValueMax = $derived(leftRange[1]);
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

	const rightDomain = $derived.by((): [number, number] => {
		const [lo, hi] = axisRange(1);
		const min = props.yAxisRight?.min ?? lo;
		const max = props.yAxisRight?.max ?? hi;
		const pad = (max - min) * 0.06 || 1;
		return [props.yAxisRight?.min ?? min - pad, props.yAxisRight?.max ?? max + pad];
	});

	const xScale = $derived(linearScale([tMin, tMax], [0, pw]));
	const yScale = $derived(linearScale([domainMin, domainMax], [ph, 0]));
	const yScaleRight = $derived(linearScale(rightDomain, [ph, 0]));
	const scaleFor = (i: number) => (seriesAxis[i] === 1 ? yScaleRight : yScale);

	const xTickCount = $derived(Math.max(2, Math.floor(pw / 90)));
	const yTickCount = $derived(Math.max(2, Math.floor(ph / 38)));
	const xTicks = $derived(niceTicks(tMin, tMax, xTickCount));
	const yTicks = $derived(niceTicks(domainMin, domainMax, yTickCount));
	const yTicksRight = $derived(
		hasRightAxis ? niceTicks(rightDomain[0], rightDomain[1], yTickCount) : []
	);
	const leftAxisTitle = $derived(props.yAxis?.label || unitGroups[0] || '');
	const rightAxisTitle = $derived(props.yAxisRight?.label || unitGroups.slice(1).join(' · '));

	// Each contiguous run is its own subpath, so no line is drawn across a gap.
	const paths = $derived(
		allSeries.map((s, i) => {
			const scale = scaleFor(i);
			return splitAtGaps(s)
				.map((run) =>
					buildLinePath(
						run.map((p) => ({ x: xScale(p.timestamp), y: scale(p.value) })),
						interpolation
					)
				)
				.join('');
		})
	);

	// Hover state
	let hoverX = $state<number | null>(null);

	const hoverTimestamp = $derived(hoverX !== null ? tMin + (hoverX / pw) * (tMax - tMin) : null);

	const hoverValues = $derived(
		allSeries.map((series, i) => {
			if (!series.length || hoverTimestamp === null) return null;
			const idx = nearestByX(series, hoverTimestamp);
			if (idx < 0) return null;
			return {
				value: series[idx].value,
				color: colors[i % colors.length],
				axis: seriesAxis[i] ?? 0
			};
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
			unit: seriesUnits[i] ?? '',
			color: colors[i % colors.length]
		}))
	);
	const tooltipH = $derived(26 + tooltipRows.length * 17 + 6);
	const zoomLabel = $derived(`${zoomLevel}×`);

	function changeZoom(direction: 1 | -1): void {
		zoomLevel = Math.max(1, Math.min(8, zoomLevel * (direction > 0 ? 2 : 0.5)));
	}

	function resetView(): void {
		zoomLevel = 1;
	}

	function onWheel(e: WheelEvent): void {
		e.preventDefault();
		changeZoom(e.deltaY < 0 ? 1 : -1);
	}

	function onPointerMove(e: PointerEvent) {
		const target = e.currentTarget as SVGRectElement;
		let x: number;
		let y: number;
		const matrix = target.getScreenCTM();
		if (matrix) {
			try {
				const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
				x = point.x;
				y = point.y;
			} catch {
				const rect = target.getBoundingClientRect();
				x = rect.width ? ((e.clientX - rect.left) * pw) / rect.width : -1;
				y = rect.height ? ((e.clientY - rect.top) * ph) / rect.height : -1;
			}
		} else {
			const rect = target.getBoundingClientRect();
			x = rect.width ? ((e.clientX - rect.left) * pw) / rect.width : -1;
			y = rect.height ? ((e.clientY - rect.top) * ph) / rect.height : -1;
		}
		hoverX = x >= 0 && x <= pw && y >= 0 && y <= ph ? x : null;
	}

	function onPointerLeave() {
		hoverX = null;
	}

	// SSE subscription for live streams
	$effect(() => {
		if ($replayRunId) {
			$replayClock.playhead;
			fetchData();
			return;
		}
		const proj = $currentProject;
		const sources = dataSources;
		const mode = $timeConductorState.mode;
		if (!proj || !sources.length) return;

		// Drop stale buffers for streams that are no longer in dataSources
		const active = new Set<string>(sources);
		for (const key of Object.keys(liveBuffer)) {
			if (!active.has(key)) {
				delete liveBuffer[key];
				delete latestEventIdBySource[key];
			}
		}

		if (mode === 'fixed') return;

		const unsubs: (() => void)[] = [];
		for (const src of sources) {
			const unsub = subscribeSSE(proj.id, src, (event) => {
				if (!('values' in event)) return;
				const samples = event.samples ?? [
					{
						timestamp: event.timestamp,
						values: event.values,
						eventId: event.eventId
					}
				];
				const incoming: Pt[] = [];
				for (const sample of samples) {
					const value = numericValue(sample.values);
					if (!isNaN(value)) {
						incoming.push({
							timestamp: sample.timestamp,
							value,
							...(sample.eventId === undefined ? {} : { eventId: sample.eventId })
						});
					}
				}
				liveBuffer[src] = mergeTimeOrderedSamples(liveBuffer[src] ?? [], incoming, LIVE_MAX_PTS);
				for (const point of incoming) {
					if (point.eventId !== undefined) {
						latestEventIdBySource[src] = Math.max(latestEventIdBySource[src] ?? 0, point.eventId);
					}
				}
				scheduleFetchData();
			});
			unsubs.push(unsub);
		}

		return () => {
			for (const u of unsubs) u();
		};
	});

	// Replay mode reads the selected fixed window instead of accepting live SSE updates.
	$effect(() => {
		const proj = $currentProject;
		const sources = dataSources;
		const state = $timeConductorState;
		if (!proj || state.mode !== 'fixed' || $replayRunId || sources.length === 0) return;

		const controller = new AbortController();
		const timer = setTimeout(() => {
			Promise.all(
				sources.map(async (source: string) => {
					const points = (
						await fetchStreamSamples(proj.id, source, {
							from: state.fixedStart,
							to: state.fixedEnd,
							limit: 5000,
							includeEventIds: true
						})
					)
						.map((sample) => ({
							timestamp: sample.timestamp,
							value: typeof sample.value === 'number' ? sample.value : NaN,
							...(sample.eventId === undefined ? {} : { eventId: sample.eventId })
						}))
						.filter((point) => Number.isFinite(point.value));
					return { source, points };
				})
			)
				.then((series) => {
					if (controller.signal.aborted) return;
					for (const { source, points } of series) {
						liveBuffer[source] = mergeTimeOrderedSamples([], points, 5000);
					}
					fetchData();
				})
				.catch((error) => {
					if (!controller.signal.aborted) console.error('Failed to load replay window', error);
				});
		}, 120);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Continuous-history playback shares the same playhead as saved-run replay.
	$effect(() => {
		if ($replayClock.mode === 'live' || $replayRunId) return;
		$replayClock.playhead;
		fetchData();
	});

	// Seed the live buffer, then poll at the configured interval as a fallback for
	// reconnects or streams that do not deliver browser-side SSE events.
	$effect(() => {
		const proj = $currentProject;
		const sources = dataSources;
		const mode = $timeConductorState.mode;
		if ($replayRunId) return;
		const controller = new AbortController();
		let refreshing = false;
		const refresh = () => {
			if (!proj || mode === 'fixed' || !sources.length || refreshing) return;
			refreshing = true;
			void refreshLiveBuffers(proj.id, sources, controller.signal).finally(() => {
				refreshing = false;
			});
		};
		refresh();
		fetchData();
		const interval =
			proj && mode !== 'fixed' && sources.length ? setInterval(refresh, pollInterval) : null;
		return () => {
			controller.abort();
			if (interval !== null) clearInterval(interval);
		};
	});

	// Stream metadata supplies units when the plot does not name them.
	$effect(() => {
		const proj = $currentProject;
		if (!proj || !dataSources.length) return;
		const controller = new AbortController();
		fetch(`/api/projects/${encodeURIComponent(proj.id)}/streams`, { signal: controller.signal })
			.then((response) => (response.ok ? response.json() : []))
			.then((list: { id: string; metadata?: Record<string, unknown> }[]) => {
				const units: Record<string, string> = {};
				for (const stream of list) {
					const unit = stream.metadata?.units ?? stream.metadata?.unit;
					if (typeof unit === 'string' && unit) units[stream.id] = unit;
				}
				streamUnits = units;
			})
			.catch(() => {
				// Without metadata every series stays on the left axis.
			});
		return () => controller.abort();
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
			<div class="plot-controls" aria-label="Plot controls" style:right="{MR + 4}px">
				<button
					type="button"
					aria-label="Zoom out"
					disabled={zoomLevel <= 1}
					onclick={() => changeZoom(-1)}
				>
					Zoom out
				</button>
				<span>{zoomLabel}</span>
				<button
					type="button"
					aria-label="Zoom in"
					disabled={zoomLevel >= 8}
					onclick={() => changeZoom(1)}
				>
					Zoom in
				</button>
				<button
					type="button"
					aria-label="Reset plot view"
					disabled={zoomLevel === 1}
					onclick={resetView}
				>
					Reset
				</button>
			</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg
				width={w}
				height={svgH}
				role="img"
				aria-label="Line plot"
				style="display:block;overflow:visible;cursor:crosshair"
			>
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
						onwheel={onWheel}
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
								fill="color-mix(in srgb, var(--mcs-danger) 12%, transparent)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.redHigh, 0)}
								y2={clampY(limitBands.redHigh, 0)}
								stroke="color-mix(in srgb, var(--mcs-danger) 60%, transparent)"
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
								fill="color-mix(in srgb, var(--mcs-warning) 10%, transparent)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.yellowHigh, 0)}
								y2={clampY(limitBands.yellowHigh, 0)}
								stroke="color-mix(in srgb, var(--mcs-warning) 60%, transparent)"
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
								fill="color-mix(in srgb, var(--mcs-danger) 12%, transparent)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.redLow, ph)}
								y2={clampY(limitBands.redLow, ph)}
								stroke="color-mix(in srgb, var(--mcs-danger) 60%, transparent)"
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
								fill="color-mix(in srgb, var(--mcs-warning) 10%, transparent)"
							/>
							<line
								x1={0}
								x2={pw}
								y1={clampY(limitBands.yellowLow, ph)}
								y2={clampY(limitBands.yellowLow, ph)}
								stroke="color-mix(in srgb, var(--mcs-warning) 60%, transparent)"
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
									{@const cy = (hv.axis === 1 ? yScaleRight : yScale)(hv.value)}
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
							<text
								x={lx}
								y={ph + 15}
								class="axis-label"
								text-anchor={lx > pw - 28 + MR ? 'end' : lx < 28 - ML ? 'start' : 'middle'}
							>
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
					{#if leftAxisTitle}
						<text
							x={-(ML - 14)}
							y={ph / 2}
							class="axis-title"
							text-anchor="middle"
							transform="rotate(-90, {-(ML - 14)}, {ph / 2})"
						>
							{leftAxisTitle}
						</text>
					{/if}

					<!-- Right Y Axis: series in a second unit -->
					{#if hasRightAxis}
						<line x1={pw} y1={0} x2={pw} y2={ph} class="axis-line" />
						{#each yTicksRight as ty}
							{@const ly = yScaleRight(ty)}
							{#if ly >= 0 && ly <= ph}
								<text x={pw + 7} y={ly + 4} class="axis-label" text-anchor="start">
									{formatValue(ty, Math.abs(ty) < 10 ? 2 : 1)}
								</text>
							{/if}
						{/each}
						{#if rightAxisTitle}
							<text
								x={pw + MR - 12}
								y={ph / 2}
								class="axis-title"
								text-anchor="middle"
								transform="rotate(90, {pw + MR - 12}, {ph / 2})"
							>
								{rightAxisTitle}
							</text>
						{/if}
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
								{row.val !== null
									? `${formatValue(row.val.value, 2)}${row.unit ? ` ${row.unit}` : ''}`
									: '—'}
							</text>
						{/each}
					</g>
				{/if}
			</svg>

			<!-- Legend -->
			{#if allSeries.length > 1}
				<div class="legend" bind:clientHeight={legendH}>
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
							{#if hasRightAxis && seriesAxis[i] === 1}
								<span class="legend-axis">right axis</span>
							{/if}
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

	.plot-controls {
		position: absolute;
		top: 4px;
		right: 6px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 3px;
		font: 600 9px/1 var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}

	.plot-controls button {
		padding: 3px 5px;
		border: 1px solid var(--mcs-border);
		border-radius: 2px;
		background: var(--mcs-surface);
		color: var(--mcs-text-muted);
		font: inherit;
		cursor: pointer;
	}

	.plot-controls button:hover:not(:disabled) {
		color: var(--mcs-text);
		border-color: var(--mcs-text-muted);
	}

	.plot-controls button:disabled {
		cursor: default;
		opacity: 0.45;
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

	.legend-axis {
		opacity: 0.75;
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
