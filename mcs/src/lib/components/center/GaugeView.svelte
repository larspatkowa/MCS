<script lang="ts">
	import type { GaugeProps } from '$lib/objects/types.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import { timeConductorState } from '$lib/stores/timeline.js';
	import { replayClock } from '$lib/stores/replay-session.js';
	import { replayRunId, replaySamplesForStream } from '$lib/stores/run.js';
	import { formatValue, arcPath, niceTicks } from '$lib/charts/chart-utils.js';
	import { fetchStreamSamples } from '$lib/charts/useStreamData.js';
	import { getGaugeDialLayout } from './gauge-layout.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: GaugeProps }>();

	let value = $state<number | null>(null);
	let displayValue = $state(0); // animated value for smooth rendering
	let _displayRaw = 0; // non-reactive snapshot for animation start
	let hasDisplayedValue = false;
	let displaySourceKey = '';
	let liveStatus = $state<'loading' | 'live' | 'stale' | 'empty' | 'error'>('loading');
	let lastLiveReceiveAt = 0;
	let historySamples = $state<{ timestamp: number; value: number }[]>([]);
	let latestEventId = 0;
	let latestLiveEventTime = Number.NEGATIVE_INFINITY;
	let activeLiveSourceKey = '';
	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(300);
	let h = $state(200);

	// Properties
	const min = $derived(props.min ?? 0);
	const max = $derived(props.max ?? 100);
	const displayType = $derived(props.displayType ?? 'linear');
	const precision = $derived(props.precision ?? 2);
	const unit = $derived(props.unit ?? '');
	const label = $derived(props.label ?? '');
	const showLabel = $derived(props.showLabel === true && label.length > 0);
	const dataSource = $derived(props.dataSource ?? '');
	const pollInterval = $derived(
		Math.max(100, Math.min(60_000, Number(props.pollInterval) || 1000))
	);
	const timeMode = $derived($timeConductorState.mode);
	const fixedStart = $derived($timeConductorState.fixedStart);
	const fixedEnd = $derived($timeConductorState.fixedEnd);
	const thresholdMin = $derived(props.thresholdMin);
	const thresholdMax = $derived(props.thresholdMax);
	const warningMin = $derived(props.warningMin);
	const warningMax = $derived(props.warningMax);
	const showRangeLabels = $derived(props.showRangeLabels !== false);

	// Axis/tick label precision: auto-derive from tick step so ranges like [0,1]
	// don't render as repeated integers ("0 0 0 1 1 1").
	const tickLabelPrecision = $derived.by(() => {
		const explicit = (props as GaugeProps & { tickLabelPrecision?: number }).tickLabelPrecision;
		if (typeof explicit === 'number' && Number.isFinite(explicit)) {
			return Math.max(0, Math.min(6, Math.round(explicit)));
		}
		const count = props.tickCount && props.tickCount > 0 ? props.tickCount : 6;
		const step =
			props.tickStep && props.tickStep > 0 ? props.tickStep : (max - min) / Math.max(1, count - 1);
		const abs = Math.abs(step);
		if (!Number.isFinite(abs) || abs <= 0) return 0;
		if (abs >= 1) return 0;
		return Math.max(1, Math.min(3, Math.ceil(-Math.log10(abs + 1e-12))));
	});

	// Theme tokens keep the numeric reading legible in both light and dark modes.
	// Explicit per-object colors remain respected.
	const arcColor = $derived(props.arcColor ?? props.normalColor ?? 'var(--mcs-text)');
	const needleColor = $derived(props.needleColor ?? 'var(--mcs-gauge-needle, #e5e5e5)');
	const thresholdColor = $derived(props.thresholdColor ?? 'var(--mcs-warning)');
	const trackColor = $derived(props.trackColor ?? 'var(--mcs-surface-alt)');
	const trackOpacity = $derived(props.trackOpacity ?? 0.3);
	const thresholdOpacity = $derived(props.thresholdOpacity ?? 0.4);

	// Configurable state colors — fall back to neutral tones.
	const colorNormal = $derived(props.normalColor ?? arcColor);
	const colorWarning = $derived(props.warningColor ?? 'var(--mcs-warning)');
	const colorAlarm = $derived(props.alarmColor ?? 'var(--mcs-danger)');

	function isUsableNumber(input: unknown): input is number {
		return (
			typeof input === 'number' &&
			Number.isFinite(input) &&
			Math.abs(input) <= Number.MAX_SAFE_INTEGER
		);
	}

	$effect(() => {
		const sourceKey = `${$currentProject?.id ?? ''}\u0000${dataSource}`;
		if (sourceKey !== displaySourceKey) {
			displaySourceKey = sourceKey;
			hasDisplayedValue = false;
		}
		const target = value;
		if (target === null) return;
		const targetValue = target;
		// A newly opened gauge starts at its first actual reading. Smooth motion is
		// reserved for changes after a real value has been rendered.
		if (!hasDisplayedValue) {
			_displayRaw = target;
			displayValue = target;
			hasDisplayedValue = true;
			return;
		}
		if (targetValue === _displayRaw) return;
		const startVal = _displayRaw; // snapshot without tracking
		const range = Math.abs((props.max ?? 100) - (props.min ?? 0)) || 1;
		const DURATION = Math.max(150, Math.min(400, range)); // scale to ~300 ms
		const startTime = performance.now();
		let rafId: number;
		function step(now: number) {
			const t = Math.min((now - startTime) / DURATION, 1);
			const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // cubic ease in-out
			_displayRaw = startVal + (targetValue - startVal) * eased;
			displayValue = _displayRaw;
			if (t < 1) rafId = requestAnimationFrame(step);
		}
		rafId = requestAnimationFrame(step);
		return () => cancelAnimationFrame(rafId);
	});

	const isHistorical = $derived(timeMode === 'fixed' || $replayClock.mode !== 'live');
	const isRunReplay = $derived(Boolean($replayRunId) && $replayClock.mode !== 'live');
	const isLiveSSE = $derived(!!dataSource && !isHistorical);
	const liveStatusLabel = $derived(
		isHistorical
			? liveStatus === 'empty'
				? 'NO DATA IN WINDOW'
				: liveStatus === 'error'
					? 'HISTORY REQUEST FAILED'
					: ''
			: liveStatus === 'loading'
				? 'LOADING'
				: liveStatus === 'stale'
					? 'STALE'
					: liveStatus === 'empty'
						? 'WAITING FOR DATA'
						: liveStatus === 'error'
							? 'DATA REQUEST FAILED'
							: ''
	);

	function numericValue(values: Record<string, unknown>): number {
		if (values.value !== undefined) return Number(values.value);
		return (
			Object.values(values)
				.map(Number)
				.find((candidate) => Number.isFinite(candidate)) ?? Number.NaN
		);
	}

	function acceptLiveValue(
		candidate: number,
		eventId?: number,
		receivedAt?: number,
		eventTime?: number
	): void {
		if (!isUsableNumber(candidate)) return;
		if (eventId !== undefined && eventId < latestEventId) return;
		if (eventId !== undefined) latestEventId = Math.max(latestEventId, eventId);
		lastLiveReceiveAt = Math.max(
			lastLiveReceiveAt,
			Number.isFinite(receivedAt) ? receivedAt! * 1000 : Date.now()
		);
		// Late arrivals still advance the durable cursor and freshness, but they
		// must not make a live display move backward in event time.
		if (Number.isFinite(eventTime) && eventTime! < latestLiveEventTime) {
			liveStatus =
				Date.now() - lastLiveReceiveAt > Math.max(10_000, pollInterval * 3) ? 'stale' : 'live';
			return;
		}
		if (Number.isFinite(eventTime)) latestLiveEventTime = Math.max(latestLiveEventTime, eventTime!);
		value = candidate;
		liveStatus =
			Date.now() - lastLiveReceiveAt > Math.max(10_000, pollInterval * 3) ? 'stale' : 'live';
	}

	function readReplayValue(): void {
		if (!isRunReplay || !dataSource) return;
		const sample = replaySamplesForStream(dataSource, { to: $replayClock.playhead })?.at(-1);
		const candidate = sample
			? typeof sample.value === 'number'
				? sample.value
				: Number(sample.value)
			: Number.NaN;
		if (isUsableNumber(candidate)) {
			value = candidate;
			liveStatus = 'live';
		} else {
			value = null;
			liveStatus = 'empty';
		}
	}

	function readHistoryValue(): void {
		const playhead = $replayClock.mode === 'live' ? fixedEnd : $replayClock.playhead;
		let low = 0;
		let high = historySamples.length;
		while (low < high) {
			const middle = low + Math.floor((high - low) / 2);
			if (historySamples[middle].timestamp <= playhead) low = middle + 1;
			else high = middle;
		}
		const sample = historySamples[low - 1];
		value = sample && isUsableNumber(sample.value) ? sample.value : null;
		liveStatus = value === null ? 'empty' : 'live';
	}

	$effect(() => {
		const historical = isHistorical;
		const runId = $replayRunId;
		const project = $currentProject;
		const source = dataSource;
		const from = fixedStart;
		const to = fixedEnd;
		if (!source) {
			value = null;
			liveStatus = 'empty';
			historySamples = [];
			return;
		}
		if (!historical || runId || !project) return;

		const controller = new AbortController();
		let active = true;
		historySamples = [];
		liveStatus = 'loading';
		fetchStreamSamples(project.id, source, {
			from,
			to,
			limit: 10_000,
			includeEventIds: true,
			signal: controller.signal
		})
			.then((samples) => {
				if (!active) return;
				historySamples = samples
					.map((sample) => ({ timestamp: sample.timestamp, value: Number(sample.value) }))
					.filter((sample) => Number.isFinite(sample.timestamp) && isUsableNumber(sample.value));
				readHistoryValue();
			})
			.catch(() => {
				if (!active || controller.signal.aborted) return;
				value = null;
				liveStatus = 'error';
			});
		return () => {
			active = false;
			controller.abort();
		};
	});

	$effect(() => {
		$replayClock.playhead;
		if (isRunReplay) readReplayValue();
		else if (isHistorical) readHistoryValue();
	});

	// Use SSE for low-latency updates and bounded, cursor-based polling as a
	// fallback. Cursor requests are uncached so configured refresh rates apply.
	$effect(() => {
		if (!isLiveSSE) return;
		const proj = $currentProject;
		if (!proj) return;
		const source = dataSource;
		const intervalMs = pollInterval;
		const controller = new AbortController();
		const sourceKey = `${proj.id}\u0000${source}`;
		if (activeLiveSourceKey !== sourceKey) {
			activeLiveSourceKey = sourceKey;
			value = null;
		}
		latestEventId = 0;
		latestLiveEventTime = Number.NEGATIVE_INFINITY;
		lastLiveReceiveAt = 0;
		liveStatus = 'loading';
		let refreshing = false;
		const refresh = async () => {
			if (refreshing || controller.signal.aborted) return;
			refreshing = true;
			try {
				const samples = await fetchStreamSamples(proj.id, source, {
					...(latestEventId > 0 ? { afterEventId: latestEventId } : {}),
					limit: latestEventId > 0 ? 10_000 : 1,
					includeEventIds: true,
					includeReceivedAt: true,
					signal: controller.signal
				});
				if (controller.signal.aborted) return;
				for (const sample of samples) {
					acceptLiveValue(
						Number(sample.value),
						sample.eventId,
						sample.receivedAt,
						sample.timestamp
					);
				}
				if (samples.length === 0) {
					if (value === null) liveStatus = 'empty';
					else if (Date.now() - lastLiveReceiveAt > Math.max(10_000, intervalMs * 3)) {
						liveStatus = 'stale';
					}
				}
			} catch {
				if (!controller.signal.aborted) {
					liveStatus =
						lastLiveReceiveAt > 0 &&
						Date.now() - lastLiveReceiveAt > Math.max(10_000, intervalMs * 3)
							? 'stale'
							: value === null
								? 'error'
								: liveStatus;
				}
			} finally {
				refreshing = false;
			}
		};

		const unsub = subscribeSSE(proj.id, dataSource, (event) => {
			if ('values' in event) {
				const samples = event.samples ?? [event];
				for (const sample of samples) {
					acceptLiveValue(numericValue(sample.values), sample.eventId, undefined, sample.timestamp);
				}
			}
		});
		void refresh();
		const timer = setInterval(() => void refresh(), intervalMs);
		return () => {
			controller.abort();
			clearInterval(timer);
			unsub();
		};
	});

	$effect(() => {
		const el = containerEl;
		if (!el) return;
		const ro = new ResizeObserver((e) => {
			const r = e[0]?.contentRect;
			if (r) {
				w = r.width || 300;
				h = r.height || 200;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Normalized value [0,1] — uses displayValue so arc/bar move smoothly
	const norm = $derived(Math.max(0, Math.min(1, (displayValue - min) / (max - min || 1))));

	// Threshold state determination
	const gaugeState = $derived.by((): 'normal' | 'warning' | 'alarm' => {
		if (value == null) return 'normal';
		if (thresholdMax !== undefined && value >= thresholdMax) return 'alarm';
		if (thresholdMin !== undefined && value <= thresholdMin) return 'alarm';
		if (warningMax !== undefined && value >= warningMax) return 'warning';
		if (warningMin !== undefined && value <= warningMin) return 'warning';
		return 'normal';
	});

	const currentColor = $derived(
		gaugeState === 'alarm' ? colorAlarm : gaugeState === 'warning' ? colorWarning : colorNormal
	);

	// ── Linear gauge ───────────────────────────────────────────────────────
	// Square-cornered track with major+minor increments (dial-style), value read-out
	// and optional caption underneath.
	const LML = 14,
		LMR = 14;
	const compactLinear = $derived(displayType === 'linear' && (w < 200 || h < 52));
	const trackH = $derived(Math.max(10, Math.min(16, Math.floor(h * 0.14))));
	const trackW = $derived(Math.max(20, w - LML - LMR));
	const TOP = 10;
	const trackY = TOP;
	const showLinearLabel = $derived(showLabel && label.length > 0);
	const showLinearAxis = $derived(showRangeLabels && !compactLinear && trackW >= 120 && h >= 50);
	const showLinearThresholdMarkers = $derived(!compactLinear && trackW >= 140);
	const fillW = $derived(Math.round(norm * trackW));

	// Major ticks (labeled)
	const linMajorTicks = $derived.by(() => {
		if (!showLinearAxis) return [];
		if (props.tickStep && props.tickStep > 0) {
			const ticks: number[] = [];
			for (let t = min; t <= max + props.tickStep * 0.001; t += props.tickStep) {
				ticks.push(Number(t.toFixed(6)));
				if (ticks.length > 20) break;
			}
			return ticks;
		}
		const targetCount =
			props.tickCount && props.tickCount > 0
				? props.tickCount
				: Math.max(3, Math.min(6, Math.round(trackW / 90)));
		return niceTicks(min, max, targetCount - 1);
	});

	// Minor ticks: 4 subdivisions between each pair of major ticks (match dial)
	const linMinorTicks = $derived.by(() => {
		if (!showLinearAxis || linMajorTicks.length < 2) return [] as number[];
		const out: number[] = [];
		for (let i = 0; i < linMajorTicks.length - 1; i++) {
			const a = linMajorTicks[i];
			const b = linMajorTicks[i + 1];
			for (let k = 1; k <= 4; k++) {
				out.push(a + ((b - a) * k) / 5);
			}
		}
		return out;
	});

	const tickTopY = $derived(trackY + trackH);
	const majorTickLen = 6;
	const minorTickLen = 3;
	const axisTickTextY = $derived(tickTopY + majorTickLen + 10);
	const valueBelowY = $derived(
		axisTickTextY + (showLinearAxis && linMajorTicks.length > 0 ? 14 : 6) + 6
	);
	const labelBelowY = $derived(valueBelowY + (showLinearLabel ? 16 : 0));

	function linearXForValue(v: number): number {
		return LML + ((v - min) / (max - min || 1)) * trackW;
	}

	// ── Dial gauge ─────────────────────────────────────────────────────────
	const DIAL_START = 135; // degrees (SVG convention: 0=right, CW positive)
	const DIAL_SWEEP = 270;
	const DIAL_END = DIAL_START + DIAL_SWEEP; // = 405

	const dialLayout = $derived(
		getGaugeDialLayout(w, h, { hasLabel: showLabel, allowRangeLabels: showRangeLabels })
	);

	// Convert a value to a dial angle (degrees)
	function valueToAngle(v: number): number {
		const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
		return DIAL_START + t * DIAL_SWEEP;
	}

	const needleAngle = $derived(valueToAngle(displayValue)); // smooth needle

	// Needle SVG path: thin pointed spike
	const needlePath = $derived.by(() => {
		const a = (needleAngle * Math.PI) / 180;
		const tipX = dialLayout.cx + dialLayout.rNeedle * Math.cos(a);
		const tipY = dialLayout.cy + dialLayout.rNeedle * Math.sin(a);
		// Base: two small points perpendicular to needle
		const perp = a + Math.PI / 2;
		const bw = dialLayout.rHub * 0.5;
		const b1x = dialLayout.cx + bw * Math.cos(perp);
		const b1y = dialLayout.cy + bw * Math.sin(perp);
		const b2x = dialLayout.cx - bw * Math.cos(perp);
		const b2y = dialLayout.cy - bw * Math.sin(perp);
		return `M${b1x},${b1y} L${tipX},${tipY} L${b2x},${b2y} Z`;
	});

	// Threshold arc from DIAL_START to thresholdMin / from thresholdMax to DIAL_END
	const thresholdMinAngle = $derived(thresholdMin != null ? valueToAngle(thresholdMin) : null);
	const thresholdMaxAngle = $derived(thresholdMax != null ? valueToAngle(thresholdMax) : null);

	// Fill arc (from start to current value)
	const fillArcPath = $derived.by(() => {
		if (norm <= 0) return null;
		const endAngle = DIAL_START + norm * DIAL_SWEEP;
		return arcPath(dialLayout.cx, dialLayout.cy, dialLayout.rFill, DIAL_START, endAngle);
	});

	// Tick marks on dial
	const dialTicks = $derived.by(() => {
		const count = props.tickCount && props.tickCount > 0 ? props.tickCount : 6;
		const step =
			props.tickStep && props.tickStep > 0 ? props.tickStep : (max - min) / Math.max(1, count - 1);
		const ticks: { angle: number; value: number; major: boolean }[] = [];
		for (let v = min; v <= max + step * 0.001; v += step) {
			ticks.push({ angle: valueToAngle(v), value: v, major: true });
			// minor ticks (4 per major)
			if (v + step <= max + step * 0.001) {
				for (let m = 1; m <= 4; m++) {
					const mv = v + (m / 5) * step;
					if (mv <= max) ticks.push({ angle: valueToAngle(mv), value: mv, major: false });
				}
			}
		}
		return ticks;
	});
</script>

<div class="gauge-root" bind:this={containerEl}>
	{#if liveStatusLabel}
		<span class="telemetry-state" role="status" aria-live="polite">{liveStatusLabel}</span>
	{/if}
	<ErrorBoundary>
		{#if w > 0 && h > 0}
			{#if displayType === 'dial'}
				<!-- ── Dial Gauge ─── -->
				<svg width={w} height={h} style="display:block;overflow:visible">
					<!-- Background track arc -->
					<path
						d={arcPath(dialLayout.cx, dialLayout.cy, dialLayout.rTrack, DIAL_START, DIAL_END)}
						fill="none"
						stroke="var(--mcs-border)"
						stroke-width={dialLayout.rOuter * 0.14}
						stroke-linecap="butt"
						opacity={trackOpacity * 2}
					/>

					<!-- Threshold zones: dashed so they remain visible even when fill color matches -->
					{#if thresholdMin != null && thresholdMinAngle != null}
						<!-- Alarm zone: below thresholdMin -->
						<path
							d={arcPath(
								dialLayout.cx,
								dialLayout.cy,
								dialLayout.rTrack,
								DIAL_START,
								thresholdMinAngle
							)}
							fill="none"
							stroke={colorAlarm}
							stroke-width={dialLayout.rOuter * 0.13}
							stroke-linecap="butt"
							stroke-dasharray="5 4"
							opacity={thresholdOpacity + 0.1}
						/>
					{/if}
					{#if thresholdMax != null && thresholdMaxAngle != null}
						<!-- Alarm zone: above thresholdMax -->
						<path
							d={arcPath(
								dialLayout.cx,
								dialLayout.cy,
								dialLayout.rTrack,
								thresholdMaxAngle,
								DIAL_END
							)}
							fill="none"
							stroke={colorAlarm}
							stroke-width={dialLayout.rOuter * 0.13}
							stroke-linecap="butt"
							stroke-dasharray="5 4"
							opacity={thresholdOpacity + 0.1}
						/>
					{/if}

					<!-- Value fill arc -->
					{#if fillArcPath}
						<path
							d={fillArcPath}
							fill="none"
							stroke={currentColor}
							stroke-width={dialLayout.rOuter * 0.1}
							stroke-linecap="butt"
							opacity="0.85"
						/>
					{/if}

					<!-- Tick marks (rendered on top of fill arc for visibility) -->
					{#each dialTicks as tick}
						{@const a = (tick.angle * Math.PI) / 180}
						{@const x1 = dialLayout.cx + dialLayout.rTickOuter * Math.cos(a)}
						{@const y1 = dialLayout.cy + dialLayout.rTickOuter * Math.sin(a)}
						{@const x2 =
							dialLayout.cx +
							(tick.major ? dialLayout.rTickInnerMajor : dialLayout.rTickInnerMinor) * Math.cos(a)}
						{@const y2 =
							dialLayout.cy +
							(tick.major ? dialLayout.rTickInnerMajor : dialLayout.rTickInnerMinor) * Math.sin(a)}
						<line
							{x1}
							{y1}
							{x2}
							{y2}
							stroke="var(--mcs-text)"
							stroke-width={tick.major ? 1.5 : 0.75}
							opacity={tick.major ? 0.7 : 0.35}
						/>
						{#if tick.major && dialLayout.showTickLabels}
							{@const tx = dialLayout.cx + dialLayout.rTickLabel * Math.cos(a)}
							{@const ty = dialLayout.cy + dialLayout.rTickLabel * Math.sin(a)}
							<text
								x={tx}
								y={ty}
								class="dial-tick-label"
								text-anchor="middle"
								dominant-baseline="middle"
							>
								{formatValue(tick.value, tickLabelPrecision)}
							</text>
						{/if}
					{/each}

					<!-- Needle -->
					<path d={needlePath} fill={needleColor} />

					<!-- Needle hub -->
					<circle cx={dialLayout.cx} cy={dialLayout.cy} r={dialLayout.rHub} fill={needleColor} />
					<circle
						cx={dialLayout.cx}
						cy={dialLayout.cy}
						r={dialLayout.rHub * 0.45}
						fill="var(--mcs-bg)"
					/>

					<!-- Value display -->
					<text
						x={dialLayout.valueX}
						y={dialLayout.valueY}
						class="dial-value"
						text-anchor={dialLayout.valueAnchor}
						dominant-baseline="middle"
						style:fill={currentColor}
						style:transition="fill 0.4s"
						style:font-size={`${dialLayout.valueFontSize}px`}
					>
						{value == null ? '—' : formatValue(displayValue, precision)}{value != null && unit
							? ' ' + unit
							: ''}
					</text>

					<!-- Label -->
					{#if dialLayout.showLabel}
						<text
							x={dialLayout.labelX}
							y={dialLayout.labelY}
							class="dial-label"
							text-anchor={dialLayout.labelAnchor}
							dominant-baseline="middle"
							style:font-size={`${dialLayout.labelFontSize}px`}
						>
							{label}
						</text>
					{/if}

					<!-- Range labels -->
					{#if dialLayout.showRangeLabels}
						<text
							x={dialLayout.cx + dialLayout.rOuter * 0.97 * Math.cos((DIAL_START * Math.PI) / 180)}
							y={dialLayout.cy +
								dialLayout.rOuter * 0.97 * Math.sin((DIAL_START * Math.PI) / 180) +
								4}
							class="range-label"
							text-anchor="middle"
						>
							{formatValue(min, tickLabelPrecision)}
						</text>
						<text
							x={dialLayout.cx + dialLayout.rOuter * 0.97 * Math.cos((DIAL_END * Math.PI) / 180)}
							y={dialLayout.cy +
								dialLayout.rOuter * 0.97 * Math.sin((DIAL_END * Math.PI) / 180) +
								4}
							class="range-label"
							text-anchor="middle"
						>
							{formatValue(max, tickLabelPrecision)}
						</text>
					{/if}
				</svg>
			{:else}
				<!-- ── Linear Gauge ─── -->
				<svg width={w} height={h} style="display:block;overflow:visible">
					<!-- Track background (square corners) -->
					<rect
						x={LML}
						y={trackY}
						width={trackW}
						height={trackH}
						fill={trackColor}
						opacity={trackOpacity}
					/>

					<!-- Threshold zones (behind fill) -->
					{#if thresholdMin != null}
						{@const x2 = linearXForValue(thresholdMin)}
						<rect
							x={LML}
							y={trackY}
							width={Math.max(0, x2 - LML)}
							height={trackH}
							fill={colorAlarm}
							opacity={thresholdOpacity}
						/>
					{/if}
					{#if warningMin != null}
						{@const x1 = thresholdMin != null ? linearXForValue(thresholdMin) : LML}
						{@const x2 = linearXForValue(warningMin)}
						<rect
							x={Math.max(LML, x1)}
							y={trackY}
							width={Math.max(0, x2 - Math.max(LML, x1))}
							height={trackH}
							fill={colorWarning}
							opacity={thresholdOpacity}
						/>
					{/if}
					{#if warningMax != null}
						{@const x1 = linearXForValue(warningMax)}
						{@const x2 = thresholdMax != null ? linearXForValue(thresholdMax) : LML + trackW}
						<rect
							x={Math.max(LML, x1)}
							y={trackY}
							width={Math.max(0, x2 - Math.max(LML, x1))}
							height={trackH}
							fill={colorWarning}
							opacity={thresholdOpacity}
						/>
					{/if}
					{#if thresholdMax != null}
						{@const x1 = linearXForValue(thresholdMax)}
						<rect
							x={Math.max(LML, x1)}
							y={trackY}
							width={Math.max(0, LML + trackW - x1)}
							height={trackH}
							fill={colorAlarm}
							opacity={thresholdOpacity}
						/>
					{/if}

					<!-- Value fill (square corners, no glossy highlight) -->
					{#if fillW > 0}
						<rect
							x={LML}
							y={trackY}
							width={fillW}
							height={trackH}
							fill={currentColor}
							style="transition: fill 0.4s"
						/>
					{/if}

					<!-- Track outline -->
					<rect
						x={LML}
						y={trackY}
						width={trackW}
						height={trackH}
						fill="none"
						class="track-outline"
					/>

					<!-- Minor ticks (short, under track) -->
					{#each linMinorTicks as tv}
						{@const tx = linearXForValue(tv)}
						<line
							x1={tx}
							y1={tickTopY}
							x2={tx}
							y2={tickTopY + minorTickLen}
							stroke="var(--mcs-text-muted)"
							stroke-width="1"
							opacity="0.4"
						/>
					{/each}

					<!-- Major ticks (longer, labeled) -->
					{#each linMajorTicks as tickVal}
						{@const tx = linearXForValue(tickVal)}
						<line
							x1={tx}
							y1={tickTopY}
							x2={tx}
							y2={tickTopY + majorTickLen}
							stroke="var(--mcs-text-muted)"
							stroke-width="1.2"
							opacity="0.75"
						/>
						<text x={tx} y={axisTickTextY} class="tick-label" text-anchor="middle">
							{formatValue(tickVal, tickLabelPrecision)}
						</text>
					{/each}

					<text
						x={LML}
						y={valueBelowY}
						class="linear-value"
						text-anchor="start"
						style:fill={currentColor}
						style="transition: fill 0.4s"
					>
						{value == null ? '—' : formatValue(displayValue, precision)}{value != null && unit
							? ' ' + unit
							: ''}
					</text>
					{#if showLinearLabel}
						<text x={LML} y={labelBelowY} class="linear-label" text-anchor="start">
							{label}
						</text>
					{/if}

					<!-- Threshold markers -->
					{#if showLinearThresholdMarkers && thresholdMin != null}
						{@const tx = linearXForValue(thresholdMin)}
						<line
							x1={tx}
							y1={trackY - 4}
							x2={tx}
							y2={trackY + trackH + 4}
							stroke="var(--mcs-danger, #222222)"
							stroke-width="1.6"
							stroke-dasharray="3 2"
							opacity="0.8"
						/>
					{/if}
					{#if showLinearThresholdMarkers && thresholdMax != null}
						{@const tx = linearXForValue(thresholdMax)}
						<line
							x1={tx}
							y1={trackY - 4}
							x2={tx}
							y2={trackY + trackH + 4}
							stroke="var(--mcs-danger, #222222)"
							stroke-width="1.6"
							stroke-dasharray="3 2"
							opacity="0.8"
						/>
					{/if}
				</svg>
			{/if}
		{/if}
	</ErrorBoundary>
</div>

<style>
	.gauge-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
		position: relative;
		container-type: size;
	}

	.telemetry-state {
		position: absolute;
		z-index: 1;
		top: 4px;
		right: 6px;
		padding: 2px 5px;
		border: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: 600 9px/1.2 var(--mcs-font-mono);
		letter-spacing: 0.025em;
		pointer-events: none;
	}

	/* Dial */
	.dial-value {
		font-family: var(--mcs-font-mono);
		font-size: clamp(14px, 4cqw, 24px);
		font-weight: 600;
	}

	.dial-label {
		font-family: var(--mcs-font-sans);
		font-size: clamp(9px, 2.1cqw, 12px);
		fill: var(--mcs-text-muted);
	}

	.dial-tick-label {
		font-family: var(--mcs-font-mono);
		font-size: clamp(9px, 2.2cqw, 13px);
		fill: var(--mcs-text-muted);
	}

	/* Linear */
	.linear-value {
		font-family: var(--mcs-font-mono);
		font-size: clamp(15px, 3.5cqw, 23px);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.track-outline {
		stroke: var(--mcs-border);
		stroke-width: 1.1;
	}

	.linear-label {
		font-family: var(--mcs-font-sans);
		font-size: clamp(9px, 2.1cqw, 12px);
		font-weight: 600;
		fill: var(--mcs-text-muted);
		letter-spacing: 0.03em;
	}

	.tick-label {
		font-family: var(--mcs-font-mono);
		font-size: 9px;
		fill: var(--mcs-text-muted);
	}

	/* Shared */
	.range-label {
		font-family: var(--mcs-font-mono);
		font-size: 9.5px;
		fill: var(--mcs-text-muted);
		opacity: 0.7;
	}
</style>
