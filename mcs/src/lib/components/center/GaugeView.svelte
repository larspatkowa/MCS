<script lang="ts">
	import type { GaugeProps } from '$lib/objects/types.js';
	import { getSampleStreamValue, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import { formatValue, arcPath, niceTicks } from '$lib/charts/chart-utils.js';
	import { getGaugeDialLayout } from './gauge-layout.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: GaugeProps }>();

	let value = $state(0);
	let displayValue = $state(0); // animated value for smooth rendering
	let _displayRaw = 0; // non-reactive snapshot for animation start
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

	// Colors with defaults
	const arcColor = $derived(props.arcColor ?? props.normalColor ?? '#4f9cf9');
	const needleColor = $derived(props.needleColor ?? 'var(--mcs-gauge-needle, #e2e8f0)');
	const thresholdColor = $derived(props.thresholdColor ?? '#f97316');
	const trackColor = $derived(props.trackColor ?? 'var(--mcs-surface-alt)');
	const trackOpacity = $derived(props.trackOpacity ?? 0.3);
	const thresholdOpacity = $derived(props.thresholdOpacity ?? 0.4);

	// Configurable state colors — fall back to arcColor / amber / red
	const colorNormal = $derived(props.normalColor ?? arcColor);
	const colorWarning = $derived(props.warningColor ?? '#f59e0b');
	const colorAlarm = $derived(props.alarmColor ?? '#ef4444');

	function isUsableNumber(input: unknown): input is number {
		return (
			typeof input === 'number' &&
			Number.isFinite(input) &&
			Math.abs(input) <= Number.MAX_SAFE_INTEGER
		);
	}

	const POLL_INTERVAL = 1500;
	$effect(() => {
		const target = value; // reactive dependency
		const startVal = _displayRaw; // snapshot without tracking
		const range = Math.abs((props.max ?? 100) - (props.min ?? 0)) || 1;
		const DURATION = Math.max(150, Math.min(400, range)); // scale to ~300 ms
		const startTime = performance.now();
		let rafId: number;
		function step(now: number) {
			const t = Math.min((now - startTime) / DURATION, 1);
			const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // cubic ease in-out
			_displayRaw = startVal + (target - startVal) * eased;
			displayValue = _displayRaw;
			if (t < 1) rafId = requestAnimationFrame(step);
		}
		rafId = requestAnimationFrame(step);
		return () => cancelAnimationFrame(rafId);
	});

	// Determine if this is a sample stream, a plugin/SSE stream, or nothing
	const isSample = $derived(isSampleStreamId(dataSource));
	const isLiveSSE = $derived(!!dataSource && !isSample);

	function fetchValue() {
		if (!dataSource || !isSample) return;
		value = getSampleStreamValue(dataSource);
	}

	// Sample stream polling
	$effect(() => {
		if (!isSample || !dataSource) return;
		fetchValue();
		const id = setInterval(fetchValue, POLL_INTERVAL);
		return () => clearInterval(id);
	});

	// SSE subscription for plugin streams
	$effect(() => {
		if (!isLiveSSE) return;
		const proj = $currentProject;
		if (!proj) return;
		// Seed with last persisted value so gauge shows real data immediately
		const sid = encodeURIComponent(dataSource);
		fetch(`/api/projects/${proj.id}/streams/${sid}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data: { lastValue?: number } | null) => {
				if (isUsableNumber(data?.lastValue)) value = data!.lastValue;
			})
			.catch(() => {});
		const unsub = subscribeSSE(proj.id, dataSource, (event) => {
			if ('values' in event) {
				const v = event.values as Record<string, unknown>;
				// Accept "value" field, or the first numeric field
				if (v.value !== undefined) {
					const numericValue = Number(v.value);
					if (isUsableNumber(numericValue)) value = numericValue;
				} else {
					for (const key of Object.keys(v)) {
						const n = Number(v[key]);
						if (isUsableNumber(n)) {
							value = n;
							break;
						}
					}
				}
			}
		});
		return unsub;
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
						{formatValue(displayValue, precision)}{unit ? ' ' + unit : ''}
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
						{formatValue(displayValue, precision)}{unit ? ' ' + unit : ''}
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
							stroke="#ef4444"
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
							stroke="#ef4444"
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
		container-type: size;
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
