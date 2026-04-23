<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import {
		timeConductorState,
		getTimeBounds,
		setFixedBounds,
		shiftFixedWindow
	} from '$lib/stores/timeline';
	import { fetchStreamData } from '$lib/charts/useStreamData.js';
	import { formatDateTime } from '$lib/date-time-format';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import type { RealtimeTimelineRow } from '$lib/objects/types.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{
		objectId: string;
		props: {
			rows?: RealtimeTimelineRow[];
			gutterWidth?: number;
			showTimeAxis?: boolean;
			autoScroll?: boolean;
		};
	}>();

	const rows = $derived((props?.rows ?? []).filter((r: any) => r.visible !== false));
	const gutterWidth = $derived(Number(props?.gutterWidth) || 90);
	const showTimeAxis = $derived(props?.showTimeAxis !== false);

	// ─── Time ──────────────────────────────────────────────────────────────────
	let nowSec = $state(Date.now() / 1000);
	$effect(() => {
		const id = setInterval(() => (nowSec = Date.now() / 1000), 1000);
		return () => clearInterval(id);
	});

	const timeRange = $derived(getTimeBounds($timeConductorState, nowSec));

	const effectiveOptions = $derived(
		getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime)
	);

	// ─── Time axis ticks ───────────────────────────────────────────────────────
	const TIME_TICKS = 6;
	const axisTicks = $derived.by(() => {
		const { start, end } = timeRange;
		const span = end - start;
		const step = span / (TIME_TICKS - 1);
		const ticks: { ts: number; pct: number; label: string }[] = [];
		for (let i = 0; i < TIME_TICKS; i++) {
			const ts = start + i * step;
			const pct = (i / (TIME_TICKS - 1)) * 100;
			const d = new Date(ts * 1000);
			// Show HH:MM:SS or HH:MM depending on span
			const label =
				span < 7200
					? d.toISOString().slice(11, 19) // HH:MM:SS
					: d.toISOString().slice(11, 16); // HH:MM
			ticks.push({ ts, pct, label });
		}
		return ticks;
	});

	// ─── Row data ──────────────────────────────────────────────────────────────
	interface RowData {
		streamPoints: { ts: number; value: number }[];
		images: { ts: number; url: string; caption?: string }[];
		events: { ts: number; label: string; severity?: string }[];
	}

	let rowData = $state<Map<string, RowData>>(new Map());

	// Poll tick (every 3s)
	const pollTick = $derived(Math.floor(nowSec / 3));

	$effect(() => {
		const proj = $currentProject;
		pollTick; // subscribe
		$timeConductorState; // subscribe

		if (!proj || rows.length === 0) {
			rowData = new Map();
			return;
		}

		const { start, end } = getTimeBounds($timeConductorState, nowSec);

		Promise.allSettled(
			rows.map(async (row: any) => {
				const rowId = row.id;
				if (row.type === 'line-chart' && row.streamId) {
					const fetched = await fetchStreamData([row.streamId]);
					const streamSamples = fetched[0]?.data ?? [];
					const field = row.field || 'value';
					const points = streamSamples
						.filter((p: any) => p.timestamp >= start && p.timestamp <= end)
						.map((p: any) => {
							const value =
								field === 'value'
									? p.value
									: ((p as unknown as Record<string, number>)[field] ?? p.value);
							return { ts: p.timestamp, value };
						});
					return { rowId, type: 'line-chart', points };
				}
				if (row.type === 'image-feed' && row.streamId) {
					// Fetch images from the samples endpoint
					if (proj.id === 'gallery') return { rowId, type: 'image-feed', images: [] };
					const res = await fetch(
						`/api/projects/${proj.id}/streams/${encodeURIComponent(row.streamId)}/samples?from=${start}&to=${end}&limit=50`
					).catch(() => null);
					if (!res?.ok) return { rowId, type: 'image-feed', images: [] };
					const raw = (await res.json()) as { data?: { timestamp: number; value: unknown }[] };
					const images = (raw.data ?? [])
						.filter((p) => typeof (p.value as Record<string, unknown>)?.url === 'string')
						.map((p) => ({
							ts: p.timestamp,
							url: (p.value as Record<string, string>).url,
							caption: (p.value as Record<string, string>).caption
						}));
					return { rowId, type: 'image-feed', images };
				}
				if (row.type === 'events') {
					if (proj.id === 'gallery') {
						const span = Math.max(1, end - start);
						const events = [
							{ ts: start + span * 0.15, label: 'Launch', severity: 'info' },
							{ ts: start + span * 0.52, label: 'Apogee', severity: 'info' },
							{ ts: start + span * 0.73, label: 'Deploy', severity: 'yellow' }
						];
						return { rowId, type: 'events', events };
					}
					const res = await fetch(
						`/api/projects/${proj.id}/limit-events?from=${start}&to=${end}`
					).catch(() => null);
					const events = res?.ok
						? ((await res.json()) as { ts: number; label: string; severity?: string }[])
						: [];
					return { rowId, type: 'events', events };
				}
				return { rowId, type: 'unknown' };
			})
		).then((results) => {
			const next = new Map<string, RowData>();
			results.forEach((r) => {
				if (r.status === 'fulfilled' && r.value) {
					const v = r.value;
					next.set(v.rowId, {
						streamPoints:
							v.type === 'line-chart'
								? (v as { points: { ts: number; value: number }[] }).points
								: [],
						images:
							v.type === 'image-feed'
								? (v as { images: { ts: number; url: string; caption?: string }[] }).images
								: [],
						events:
							v.type === 'events'
								? (v as { events: { ts: number; label: string; severity?: string }[] }).events
								: []
					});
				}
			});
			rowData = next;
		});
	});

	// ─── Chart path helpers ────────────────────────────────────────────────────

	function buildLinePath(
		points: { ts: number; value: number }[],
		width: number,
		height: number,
		start: number,
		end: number,
		yMin?: number,
		yMax?: number
	): string {
		if (points.length === 0) return '';
		const span = Math.max(1, end - start);
		const vals = points.map((p) => p.value);
		const minV = yMin !== undefined ? yMin : Math.min(...vals);
		const maxV = yMax !== undefined ? yMax : Math.max(...vals);
		const vRange = Math.max(0.001, maxV - minV);

		const toX = (ts: number) => ((ts - start) / span) * width;
		const toY = (v: number) => height - ((v - minV) / vRange) * height;

		let d = '';
		for (let i = 0; i < points.length; i++) {
			const x = toX(points[i].ts);
			const y = toY(points[i].value);
			d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
		}
		return d;
	}

	function buildAreaPath(
		points: { ts: number; value: number }[],
		width: number,
		height: number,
		start: number,
		end: number,
		yMin?: number,
		yMax?: number
	): string {
		if (points.length === 0) return '';
		const span = Math.max(1, end - start);
		const vals = points.map((p) => p.value);
		const minV = yMin !== undefined ? yMin : Math.min(...vals);
		const maxV = yMax !== undefined ? yMax : Math.max(...vals);
		const vRange = Math.max(0.001, maxV - minV);

		const toX = (ts: number) => ((ts - start) / span) * width;
		const toY = (v: number) => height - ((v - minV) / vRange) * height;

		let d = `M ${toX(points[0].ts).toFixed(1)} ${height}`;
		for (const p of points) {
			d += ` L ${toX(p.ts).toFixed(1)} ${toY(p.value).toFixed(1)}`;
		}
		d += ` L ${toX(points[points.length - 1].ts).toFixed(1)} ${height} Z`;
		return d;
	}

	function yLabel(points: { ts: number; value: number }[], row: RealtimeTimelineRow): string {
		if (points.length === 0) return '';
		const last = points[points.length - 1].value;
		return last.toFixed(1);
	}

	// ─── Row height math ───────────────────────────────────────────────────────
	function rowHeight(row: RealtimeTimelineRow): number {
		return Math.max(40, Number(row.height) || 80);
	}

	// ─── Position helper ───────────────────────────────────────────────────────
	function toPct(ts: number): number {
		const { start, end } = timeRange;
		return ((ts - start) / Math.max(1, end - start)) * 100;
	}

	// ─── Resize tracking ───────────────────────────────────────────────────────
	let containerEl = $state<HTMLDivElement | undefined>();
	let containerWidth = $state(600);

	$effect(() => {
		if (!containerEl) return;
		const obs = new ResizeObserver((entries) => {
			containerWidth = entries[0]?.contentRect.width ?? 600;
		});
		obs.observe(containerEl);
		return () => obs.disconnect();
	});

	const trackWidth = $derived(Math.max(1, containerWidth - gutterWidth));
	const visibleSpanSec = $derived(Math.max(60, timeRange.end - timeRange.start));

	function shiftTimeline(direction: -1 | 1) {
		const delta = visibleSpanSec * 0.35 * direction;
		if ($timeConductorState.mode === 'realtime') {
			setFixedBounds(timeRange.start + delta, timeRange.end + delta);
			return;
		}
		shiftFixedWindow(delta);
	}

	function jumpToNow() {
		setFixedBounds(Date.now() / 1000 - visibleSpanSec, Date.now() / 1000);
	}

	function handleAxisWheel(event: WheelEvent) {
		const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
		if (!horizontalIntent) return;
		event.preventDefault();
		const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
		if (delta === 0) return;
		shiftTimeline(delta > 0 ? 1 : -1);
	}
</script>

<div class="rt-root" bind:this={containerEl}>
	<ErrorBoundary>
		<div class="rt-layout">
			{#if rows.length === 0}
				<div class="rt-empty">Add rows in the Properties panel to build a timeline.</div>
			{:else}
				<div class="rt-body">
					<!-- Row grid -->
					{#each rows as row (row.id)}
						{@const h = rowHeight(row)}
						{@const data = rowData.get(row.id) ?? { streamPoints: [], images: [], events: [] }}
						{@const color = row.color || 'var(--mcs-accent)'}

						<div class="rt-row" style="height: {h}px; min-height: {h}px;">
							<!-- Gutter label -->
							<div class="rt-gutter" style="width: {gutterWidth}px; min-width: {gutterWidth}px;">
								<span class="rt-row-label">{row.label || row.streamId || row.type}</span>
								{#if row.type === 'line-chart' && data.streamPoints.length > 0}
									<span class="rt-row-value">{yLabel(data.streamPoints, row)}</span>
								{/if}
							</div>

							<!-- Track -->
							<div class="rt-track">
								{#if row.type === 'line-chart'}
									<!-- SVG chart -->
									<svg
										class="rt-chart-svg"
										width={trackWidth}
										height={h}
										viewBox="0 0 {trackWidth} {h}"
										preserveAspectRatio="none"
									>
										<!-- Grid lines -->
										{#each [0.25, 0.5, 0.75] as f}
											<line
												x1="0"
												y1={h * f}
												x2={trackWidth}
												y2={h * f}
												stroke="var(--mcs-border)"
												stroke-width="0.5"
												opacity="0.5"
											/>
										{/each}

										<!-- "Now" line in realtime mode -->
										{#if $timeConductorState.mode === 'realtime'}
											{@const nPct = toPct(nowSec)}
											{#if nPct >= 0 && nPct <= 100}
												<line
													x1={(trackWidth * nPct) / 100}
													y1="0"
													x2={(trackWidth * nPct) / 100}
													y2={h}
													stroke="var(--mcs-accent)"
													stroke-width="1"
													opacity="0.3"
												/>
											{/if}
										{/if}

										<!-- Area fill -->
										{#if data.streamPoints.length > 1}
											<path
												d={buildAreaPath(
													data.streamPoints,
													trackWidth,
													h,
													timeRange.start,
													timeRange.end,
													row.yMin,
													row.yMax
												)}
												fill={color}
												opacity="0.12"
											/>
										{/if}

										<!-- Line -->
										{#if data.streamPoints.length > 0}
											<path
												d={buildLinePath(
													data.streamPoints,
													trackWidth,
													h,
													timeRange.start,
													timeRange.end,
													row.yMin,
													row.yMax
												)}
												stroke={color}
												stroke-width="1.5"
												fill="none"
												stroke-linejoin="round"
												stroke-linecap="round"
											/>
										{/if}

										{#if data.streamPoints.length === 0}
											<text
												x={trackWidth / 2}
												y={h / 2}
												text-anchor="middle"
												dominant-baseline="middle"
												fill="var(--mcs-text-muted)"
												font-size="11"
												font-family="var(--mcs-font-mono)">No data</text
											>
										{/if}
									</svg>
								{:else if row.type === 'image-feed'}
									<!-- Images positioned by timestamp -->
									<div class="rt-image-track" style="height: {h}px;">
										{#each data.images as img}
											{@const pct = toPct(img.ts)}
											{#if pct >= -5 && pct <= 105}
												<div
													class="rt-image-marker"
													style="left: {pct}%;"
													title={img.caption ?? ''}
												>
													<img src={img.url} alt={img.caption ?? 'frame'} />
												</div>
											{/if}
										{/each}
										{#if data.images.length === 0}
											<span class="rt-track-empty">No images in range</span>
										{/if}
									</div>
								{:else if row.type === 'events'}
									<!-- Events strip -->
									<div class="rt-events-track" style="height: {h}px;">
										{#each data.events as evt}
											{@const pct = toPct(evt.ts)}
											{#if pct >= 0 && pct <= 100}
												<div
													class="rt-event-marker"
													class:evt-red={evt.severity === 'red'}
													class:evt-yellow={evt.severity === 'yellow'}
													style="left: {pct}%;"
													title={evt.label}
												>
													<span class="rt-event-label">{evt.label}</span>
												</div>
											{/if}
										{/each}
										{#if data.events.length === 0}
											<span class="rt-track-empty">No events in range</span>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					{/each}

					<!-- Time axis -->
					{#if showTimeAxis}
						<div class="rt-time-axis">
							<div
								class="rt-gutter"
								style="width: {gutterWidth}px; min-width: {gutterWidth}px;"
							></div>
							<div class="rt-axis-track" onwheel={handleAxisWheel}>
								{#each axisTicks as tick}
									<div class="rt-axis-tick" style="left: {tick.pct}%;">
										<div class="rt-axis-notch"></div>
										<span class="rt-axis-label">{tick.label}</span>
									</div>
								{/each}
							</div>
							<div class="rt-axis-nav" role="group" aria-label="Timeline navigation">
								<button type="button" class="rt-axis-btn" onclick={() => shiftTimeline(-1)}>
									&#8249;
								</button>
								<button type="button" class="rt-axis-now-btn" onclick={jumpToNow}>Now</button>
								<button type="button" class="rt-axis-btn" onclick={() => shiftTimeline(1)}>
									&#8250;
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</ErrorBoundary>
</div>

<style>
	.rt-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		width: 100%;
		background: var(--mcs-surface);
		overflow: hidden;
	}

	.rt-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 0.85rem;
		font-family: var(--mcs-font-mono);
		text-align: center;
		padding: 2rem;
	}

	.rt-body {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow-y: auto;
	}

	.rt-row {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}

	.rt-gutter {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		padding: 0 0.5rem;
		border-right: 1px solid var(--mcs-border);
		flex-shrink: 0;
		gap: 0.1rem;
	}

	.rt-row-label {
		font-size: 0.65rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
		text-align: right;
	}

	.rt-row-value {
		font-size: 0.72rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-accent);
		font-weight: 600;
		text-align: right;
	}

	.rt-track {
		flex: 1;
		min-width: 0;
		position: relative;
		overflow: hidden;
	}

	.rt-chart-svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	/* Image feed */
	.rt-image-track {
		position: relative;
		display: flex;
		align-items: center;
	}

	.rt-image-marker {
		position: absolute;
		transform: translateX(-50%);
		width: 3.5rem;
		height: calc(100% - 0.5rem);
		top: 0.25rem;
		overflow: hidden;
		border-radius: 3px;
		border: 1px solid var(--mcs-border);
		cursor: pointer;
		transition: border-color 80ms;
	}

	.rt-image-marker:hover {
		border-color: var(--mcs-accent);
		z-index: 2;
	}

	.rt-image-marker img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* Events strip */
	.rt-events-track {
		position: relative;
	}

	.rt-event-marker {
		position: absolute;
		top: 0;
		height: 100%;
		width: 2px;
		background: var(--mcs-accent);
		transform: translateX(-50%);
		cursor: default;
	}
	.rt-event-marker.evt-red {
		background: #ef4444;
	}
	.rt-event-marker.evt-yellow {
		background: #f59e0b;
	}

	.rt-event-label {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: 0.62rem;
		font-family: var(--mcs-font-mono);
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		padding: 0.1rem 0.25rem;
		border-radius: 0.2rem;
		margin-bottom: 2px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 80ms;
	}
	.rt-event-marker:hover .rt-event-label {
		opacity: 1;
	}

	/* Empty state within track */
	.rt-track-empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.68rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		opacity: 0.5;
	}

	/* Time axis */
	.rt-time-axis {
		display: flex;
		align-items: stretch;
		height: 2.1rem;
		min-height: 2.1rem;
		border-top: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}

	.rt-axis-track {
		flex: 1;
		position: relative;
		min-width: 0;
	}
	.rt-axis-nav {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0 0.45rem;
		border-left: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}
	.rt-axis-btn {
		border: 1px solid var(--mcs-border);
		background: transparent;
		color: var(--mcs-text-muted);
		font-size: 0.68rem;
		line-height: 1;
		padding: 0.18rem 0.38rem;
		border-radius: 0.25rem;
		cursor: pointer;
	}
	.rt-axis-btn:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}

	.rt-axis-now-btn {
		border: none;
		background: transparent;
		color: var(--mcs-text-muted);
		font-size: 0.68rem;
		line-height: 1;
		padding: 0.18rem 0.2rem;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.15em;
		text-decoration-thickness: 1px;
	}

	.rt-axis-now-btn:hover {
		color: var(--mcs-text);
	}

	.rt-axis-now-btn:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--mcs-accent) 65%, transparent);
		outline-offset: 2px;
		border-radius: 2px;
	}

	.rt-axis-tick {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.rt-axis-notch {
		width: 1px;
		height: 5px;
		background: var(--mcs-border);
	}

	.rt-axis-label {
		font-size: 0.6rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		white-space: nowrap;
		margin-top: 2px;
	}
</style>
