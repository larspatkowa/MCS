<script lang="ts">
	import type { GanttChartProps, GanttTask } from '$lib/objects/types.js';

	let { objectId, props } = $props<{ objectId: string; props: GanttChartProps }>();

	const showNow = $derived(props.showNow !== false);
	const windowSec = $derived(props.windowSec ?? 3600);
	const rowH = $derived(props.rowHeight ?? 28);
	const labelW = $derived(props.labelWidth ?? 120);

	let containerEl = $state<HTMLDivElement | null>(null);
	let w = $state(600);
	let h = $state(300);
	let now = $state(Date.now() / 1000);
	let followNow = $state(true);
	let manualViewStart = $state(0);
	let panState = $state<{ pointerId: number; startX: number; startViewStart: number } | null>(null);

	$effect(() => {
		const id = setInterval(() => (now = Date.now() / 1000), 1000);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (followNow) {
			manualViewStart = now - windowSec * 0.3;
		}
	});

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) {
				w = rect.width || 600;
				h = rect.height || 300;
			}
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	const tasks = $derived.by((): GanttTask[] => {
		if (props.tasks && props.tasks.length > 0) return props.tasks;
		const base = Math.floor(now / 60) * 60 - windowSec * 0.3;
		return [
			{
				id: 'g1',
				label: 'Pre-flight checks',
				start: base,
				end: base + 600,
				color: '#3b82f6',
				progress: 100
			},
			{
				id: 'g2',
				label: 'Propellant loading',
				start: base + 500,
				end: base + 1200,
				color: '#f59e0b',
				progress: 80
			},
			{
				id: 'g3',
				label: 'Terminal count',
				start: base + 1100,
				end: base + 1800,
				color: '#10b981',
				progress: 45
			},
			{
				id: 'g4',
				label: 'Launch window',
				start: base + 1700,
				end: base + 2400,
				color: '#ef4444',
				progress: 0
			},
			{
				id: 'g5',
				label: 'Ascent telemetry',
				start: base + 2300,
				end: base + 3200,
				color: '#8b5cf6',
				progress: 0
			},
			{
				id: 'g6',
				label: 'MECO + staging',
				start: base + 3100,
				end: base + 3600,
				color: '#06b6d4',
				progress: 0
			}
		];
	});

	const viewStart = $derived(manualViewStart);
	const viewEnd = $derived(viewStart + windowSec);
	const chartW = $derived(Math.max(100, w - labelW - 2));
	const totalChartHeight = $derived(tasks.length * rowH + 24);

	function tToPx(t: number): number {
		return ((t - viewStart) / (viewEnd - viewStart)) * chartW;
	}

	function formatTick(t: number): string {
		const date = new Date(t * 1000);
		return date.toISOString().slice(11, 19);
	}

	const axisTicks = $derived.by(() => {
		const tickCount = Math.max(2, Math.floor(chartW / 110));
		const step = windowSec / tickCount;
		const ticks: { px: number; label: string }[] = [];
		for (let i = 0; i <= tickCount; i += 1) {
			const t = viewStart + i * step;
			ticks.push({ px: tToPx(t), label: formatTick(t) });
		}
		return ticks;
	});

	const nowPx = $derived(tToPx(now));

	function jumpToNow() {
		followNow = true;
		manualViewStart = now - windowSec * 0.3;
	}

	function startPan(event: PointerEvent) {
		if (event.button !== 0) return;
		panState = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startViewStart: viewStart
		};
		(event.currentTarget as HTMLElement)?.setPointerCapture?.(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		if (!panState || chartW <= 0) return;
		if (event.pointerId !== panState.pointerId) return;
		followNow = false;
		const deltaPx = event.clientX - panState.startX;
		const deltaSec = (deltaPx / chartW) * windowSec;
		manualViewStart = panState.startViewStart - deltaSec;
	}

	function endPan(event?: PointerEvent) {
		if (event && panState && event.pointerId !== panState.pointerId) return;
		panState = null;
	}

	function handleWheel(event: WheelEvent) {
		if (event.ctrlKey) return;
		const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey;
		if (!horizontalIntent || chartW <= 0) return;
		event.preventDefault();
		event.stopPropagation();
		followNow = false;
		const deltaPx = event.deltaX !== 0 ? event.deltaX : event.deltaY;
		manualViewStart += (deltaPx / chartW) * windowSec;
	}
</script>

<div class="gantt-root" bind:this={containerEl}>
	{#if w > 0 && h > 0}
		<div class="gantt-scroll" style="height:{h}px">
			<div class="labels" style="width:{labelW}px;min-height:{totalChartHeight}px">
				<div class="axis-label" style="height:24px">
					<span>Task</span>
					{#if showNow}
						<button
							type="button"
							class="axis-now-btn"
							class:following={followNow}
							onclick={jumpToNow}
						>
							Now
						</button>
					{/if}
				</div>
				{#each tasks as task}
					<div class="label-row" style="height:{rowH}px" title={task.label}>
						{task.label}
					</div>
				{/each}
			</div>

			<div
				class="chart-area"
				class:panning={!!panState}
				style="width:{chartW}px;min-height:{totalChartHeight}px"
				role="group"
				aria-label="Gantt timeline"
				onpointerdown={startPan}
				onpointermove={onPointerMove}
				onpointerup={endPan}
				onpointercancel={endPan}
				onwheel={handleWheel}
			>
				<div class="time-axis" style="height:24px">
					{#each axisTicks as tick}
						<span class="tick-label" style="left:{tick.px}px">{tick.label}</span>
					{/each}
				</div>

				<div class="rows-surface" style="height:{tasks.length * rowH}px">
					{#each tasks as task}
						{@const barStart = Math.max(0, tToPx(task.start))}
						{@const barEnd = Math.min(chartW, tToPx(task.end))}
						{@const barW = Math.max(0, barEnd - barStart)}
						{@const visible = barEnd > 0 && barStart < chartW}
						{@const progress = task.progress ?? 0}

						<div class="gantt-row" style="height:{rowH}px">
							{#if visible && barW > 0}
								<div
									class="task-bar"
									style="left:{barStart}px;width:{barW}px;background:{task.color ?? '#4f9cf9'}33"
									title="{task.label}: {progress}%"
								>
									{#if progress > 0}
										<div
											class="task-progress"
											style="width:{progress}%;background:{task.color ?? '#4f9cf9'}"
										></div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if showNow && nowPx >= 0 && nowPx <= chartW}
					<div class="now-line" style="left:{nowPx}px;height:{totalChartHeight}px">
					</div>
				{/if}

				{#each axisTicks as tick}
					<div class="grid-line" style="left:{tick.px}px;height:{totalChartHeight}px"></div>
				{/each}
			</div>
		</div>

		{#if tasks.length === 0}
			<div class="empty">Define tasks in properties or connect a data source</div>
		{/if}
	{/if}
</div>

<style>
	.gantt-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
		font-family: var(--mcs-font-sans);
		position: relative;
		overscroll-behavior-x: contain;
	}

	.axis-now-btn {
		min-width: 2rem;
		height: 1.15rem;
		padding: 0 0.1rem;
		border: none;
		background: transparent;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
		font-size: 0.63rem;
		border-radius: 2px;
		cursor: pointer;
		flex-shrink: 0;
		text-decoration: underline;
		text-underline-offset: 0.15em;
		text-decoration-thickness: 1px;
	}

	.axis-now-btn:hover {
		color: var(--mcs-text);
	}

	.axis-now-btn.following {
		color: var(--mcs-text);
		text-decoration-thickness: 2px;
		text-decoration-color: color-mix(in srgb, var(--mcs-accent) 75%, transparent);
	}

	.axis-now-btn:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--mcs-accent) 65%, transparent);
		outline-offset: 2px;
	}

	.gantt-scroll {
		display: flex;
		overflow-y: auto;
		overflow-x: hidden;
		overscroll-behavior-x: contain;
	}

	.labels {
		flex-shrink: 0;
		border-right: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		z-index: 3;
		position: sticky;
		left: 0;
	}

	.axis-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.45rem;
		padding: 0 0.5rem;
		font-size: 0.62rem;
		color: var(--mcs-text-muted);
		border-bottom: 1px solid var(--mcs-border);
		font-weight: 600;
	}

	.label-row {
		display: flex;
		align-items: center;
		padding: 0 0.5rem;
		font-size: 0.72rem;
		color: var(--mcs-text);
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chart-area {
		position: relative;
		flex-shrink: 0;
		cursor: grab;
		user-select: none;
		overflow: hidden;
		touch-action: pan-y;
		overscroll-behavior-x: contain;
	}

	.chart-area.panning {
		cursor: grabbing;
	}

	.time-axis {
		position: relative;
		border-bottom: 1px solid var(--mcs-border);
		background: color-mix(in srgb, var(--mcs-surface-alt) 82%, transparent);
	}

	.tick-label {
		position: absolute;
		bottom: 0.2rem;
		transform: translateX(-50%);
		font-family: var(--mcs-font-mono);
		font-size: 0.58rem;
		color: var(--mcs-text-muted);
		white-space: nowrap;
	}

	.rows-surface {
		position: relative;
	}

	.gantt-row {
		position: relative;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 40%, transparent);
	}

	.task-bar {
		position: absolute;
		top: 4px;
		height: calc(100% - 8px);
		border-radius: 0;
		overflow: hidden;
		min-width: 2px;
		border: 1px solid color-mix(in srgb, var(--mcs-border) 55%, transparent);
	}

	.task-progress {
		height: 100%;
		border-radius: 0;
		transition: width 0.3s;
	}

	.now-line {
		position: absolute;
		top: 0;
		width: 2px;
		background: #ef4444;
		z-index: 5;
		pointer-events: none;
	}

	.grid-line {
		position: absolute;
		top: 0;
		width: 1px;
		background: var(--mcs-border);
		opacity: 0.3;
		pointer-events: none;
		z-index: 1;
	}

	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
	}
</style>
