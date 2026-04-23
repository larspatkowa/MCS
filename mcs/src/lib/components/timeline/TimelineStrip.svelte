<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import { timeConductorState, getTimeBounds } from '$lib/stores/timeline';

	let {
		variant = 'compact',
		showAnnotations = true,
		showLimitEvents = true,
		source = 'all'
	} = $props<{
		variant?: 'compact' | 'full';
		showAnnotations?: boolean;
		showLimitEvents?: boolean;
		source?: string;
	}>();

	const FETCH_THROTTLE_SEC = 30;

	let now = $state(Date.now() / 1000);
	let annotations = $state<{ id: string; ts: number; label: string; details?: string }[]>([]);
	let limitEvents = $state<{ id: string; ts: number; label: string; severity: string }[]>([]);

	$effect(() => {
		const id = setInterval(() => (now = Date.now() / 1000), 1000);
		return () => clearInterval(id);
	});

	const timeRange = $derived.by(() => getTimeBounds($timeConductorState, now));

	/**
	 * Pick a notch step that gives ~5-8 marks across the visible range,
	 * aligned to "nice" boundaries (minutes, hours, etc.).
	 */
	function niceStepSec(spanSec: number): number {
		const targets = [
			30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 604800
		];
		const ideal = spanSec / 6;
		for (const t of targets) if (t >= ideal) return t;
		return targets[targets.length - 1];
	}

	function formatTickLabel(ts: number, spanSec: number): string {
		const d = new Date(ts * 1000);
		if (spanSec <= 7200) {
			// HH:MM:SS
			const hh = String(d.getUTCHours()).padStart(2, '0');
			const mm = String(d.getUTCMinutes()).padStart(2, '0');
			const ss = String(d.getUTCSeconds()).padStart(2, '0');
			return `${hh}:${mm}:${ss}`;
		} else if (spanSec <= 86400) {
			// HH:MM
			const hh = String(d.getUTCHours()).padStart(2, '0');
			const mm = String(d.getUTCMinutes()).padStart(2, '0');
			return `${hh}:${mm}`;
		} else {
			// MM-DD HH:MM
			const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
			const dd = String(d.getUTCDate()).padStart(2, '0');
			const hh = String(d.getUTCHours()).padStart(2, '0');
			const mm = String(d.getUTCMinutes()).padStart(2, '0');
			return `${mo}-${dd} ${hh}:${mm}`;
		}
	}

	const notches = $derived.by(() => {
		const { start, end } = timeRange;
		const span = end - start;
		const stepSec = niceStepSec(span);
		const firstNotch = Math.ceil(start / stepSec) * stepSec;
		const out: { pos: number; ts: number; label: string }[] = [];
		for (let t = firstNotch; t < end; t += stepSec) {
			const pos = ((t - start) / span) * 100;
			if (pos >= 0 && pos <= 100) {
				out.push({ pos, ts: t, label: formatTickLabel(t, span) });
			}
		}
		return out;
	});

	/** "now" cursor position as a percentage. Only valid in realtime mode. */
	const nowPct = $derived.by(() => {
		if ($timeConductorState.mode !== 'realtime') return null;
		const { start, end } = timeRange;
		const pct = ((now - start) / (end - start)) * 100;
		return pct >= 0 && pct <= 100 ? pct : null;
	});

	const fetchTick = $derived(Math.floor(now / FETCH_THROTTLE_SEC));

	// Annotations
	$effect(() => {
		const wantAnnotations = showAnnotations && (source === 'all' || source === 'annotations');
		if (!wantAnnotations) {
			annotations = [];
			return;
		}

		const proj = $currentProject;
		$timeConductorState;
		fetchTick;
		if (!proj) return;
		if (proj.id === 'gallery') {
			const { start, end } = getTimeBounds($timeConductorState, Date.now() / 1000);
			const span = Math.max(1, end - start);
			annotations = [
				{
					id: 'gallery-launch',
					ts: start + span * 0.18,
					label: 'Launch',
					details: 'Motor ignition'
				},
				{
					id: 'gallery-apogee',
					ts: start + span * 0.47,
					label: 'Apogee',
					details: 'Max altitude reached'
				},
				{
					id: 'gallery-deploy',
					ts: start + span * 0.52,
					label: 'Deploy',
					details: 'Parachute deployment'
				},
				{ id: 'gallery-landing', ts: start + span * 0.78, label: 'Landing', details: 'Touchdown' }
			];
			return;
		}
		const { start, end } = getTimeBounds($timeConductorState, Date.now() / 1000);
		fetch(`/api/projects/${proj.id}/annotations?from=${start}&to=${end}`)
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => (annotations = list));
	});

	// Limit events
	$effect(() => {
		const wantLimits = showLimitEvents && (source === 'all' || source === 'limit-events');
		if (!wantLimits) {
			limitEvents = [];
			return;
		}

		const proj = $currentProject;
		$timeConductorState;
		fetchTick;
		if (!proj || proj.id === 'gallery') {
			if (proj?.id === 'gallery') {
				const { start, end } = getTimeBounds($timeConductorState, Date.now() / 1000);
				const span = Math.max(1, end - start);
				limitEvents = [
					{ id: 'gallery-lim1', ts: start + span * 0.32, label: 'TEMP > 80C', severity: 'yellow' },
					{ id: 'gallery-lim2', ts: start + span * 0.61, label: 'BATT < 3.2V', severity: 'red' }
				];
			} else {
				limitEvents = [];
			}
			return;
		}
		const { start, end } = getTimeBounds($timeConductorState, Date.now() / 1000);
		fetch(`/api/projects/${proj.id}/limit-events?from=${start}&to=${end}`)
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => (limitEvents = list));
	});
</script>

<div class="timeline-strip" class:full={variant === 'full'}>
	<div class="track">
		<!-- Notch ticks with time labels -->
		{#each notches as n}
			<span class="notch" style="left: {n.pos}%" aria-hidden="true">
				<span class="notch-label">{n.label}</span>
			</span>
		{/each}

		<!-- Live "now" cursor (realtime mode only) -->
		{#if nowPct !== null}
			<span class="now-cursor" style="left: {nowPct}%" aria-label="Now"></span>
		{/if}

		{#if showAnnotations && (source === 'all' || source === 'annotations')}
			{#each annotations as a}
				{@const pos = ((a.ts - timeRange.start) / (timeRange.end - timeRange.start)) * 100}
				<span
					class="marker"
					style="left: {pos}%"
					title="{a.label}{a.details ? '\n' + a.details : ''}"
				>
					<span class="marker-tip">{a.label}</span>
				</span>
			{/each}
		{/if}
		{#if showLimitEvents && (source === 'all' || source === 'limit-events')}
			{#each limitEvents as e}
				{@const pos = ((e.ts - timeRange.start) / (timeRange.end - timeRange.start)) * 100}
				<span
					class="marker limit-marker"
					class:limit-red={e.severity === 'red'}
					class:limit-yellow={e.severity === 'yellow'}
					style="left: {pos}%"
					title={e.label}
				>
					<span class="marker-tip">{e.label}</span>
				</span>
			{/each}
		{/if}
	</div>
</div>

<style>
	.timeline-strip {
		height: 2rem;
		min-height: 2rem;
		position: relative;
		background: var(--mcs-surface-alt);
		border-radius: 2px;
		overflow: hidden;
	}
	.timeline-strip.full {
		min-height: 5rem;
		height: 5rem;
	}
	.track {
		position: relative;
		height: 100%;
		width: 100%;
		overflow: hidden;
	}
	.notch {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--mcs-border);
		transform: translateX(-50%);
		pointer-events: none;
	}
	.notch-label {
		position: absolute;
		bottom: 0.2rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.55rem;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		white-space: nowrap;
		pointer-events: none;
		opacity: 0.75;
		padding: 0 0.16rem;
		background: color-mix(in srgb, var(--mcs-surface-alt) 84%, transparent);
		border-radius: 2px;
	}
	/* In full variant, show labels above the track */
	.full .notch-label {
		bottom: auto;
		top: 0.18rem;
	}
	.now-cursor {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--mcs-accent);
		transform: translateX(-50%);
		opacity: 0.8;
		pointer-events: none;
		border-radius: 1px;
		box-shadow: 0 0 4px var(--mcs-accent);
	}
	.marker {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		height: 100%;
		width: 3px;
		background: var(--mcs-accent);
		border-radius: 1px;
		opacity: 0.75;
		cursor: default;
	}
	.marker-tip {
		position: absolute;
		left: 50%;
		top: 0.15rem;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: 0.68rem;
		font-family: var(--mcs-font-mono);
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		padding: 0.12rem 0.28rem;
		border-radius: 0.22rem;
		opacity: 0;
		pointer-events: none;
		transition: opacity 120ms ease;
	}
	.marker:hover .marker-tip {
		opacity: 1;
	}
	.limit-marker.limit-red {
		background: #ef4444;
	}
	.limit-marker.limit-yellow {
		background: #f59e0b;
	}
</style>
