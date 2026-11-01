<script lang="ts">
	import type { GroundTrackProps } from '$lib/objects/types.js';
	import { useStreamTrack } from '$lib/telemetry/live-data.svelte.js';
	import { bearingDegrees, distanceMeters, niceRingStep } from './ground-track.js';

	let { props } = $props<{ objectId: string; props: GroundTrackProps }>();

	const source = $derived(props.dataSource ?? '');
	const latField = $derived(props.latField || 'lat');
	const lonField = $derived(props.lonField || 'lon');
	const altField = $derived(props.altField || 'alt');

	const track = useStreamTrack(
		() => source,
		() => props.windowSec ?? 3600
	);

	const fixes = $derived(
		track.samples
			.map((sample) => ({
				t: sample.timestamp,
				lat: Number(sample.values[latField]),
				lon: Number(sample.values[lonField]),
				alt: Number(sample.values[altField])
			}))
			.filter(
				(fix) =>
					Number.isFinite(fix.lat) &&
					Number.isFinite(fix.lon) &&
					Math.abs(fix.lat) <= 90 &&
					Math.abs(fix.lon) <= 180 &&
					!(fix.lat === 0 && fix.lon === 0)
			)
	);

	const pad = $derived(
		Number.isFinite(props.padLat) && Number.isFinite(props.padLon)
			? { lat: props.padLat as number, lon: props.padLon as number }
			: fixes[0]
				? { lat: fixes[0].lat, lon: fixes[0].lon }
				: null
	);
	const current = $derived(fixes.at(-1) ?? null);

	let width = $state(400);
	let height = $state(300);

	// Local tangent-plane projection around the pad, in meters. Accurate to a
	// fraction of a percent over the few kilometers a rocket flight covers.
	const R = 6_371_008.8;
	function project(lat: number, lon: number): [number, number] {
		if (!pad) return [0, 0];
		const x = ((lon - pad.lon) * Math.PI * R * Math.cos((pad.lat * Math.PI) / 180)) / 180;
		const y = ((lat - pad.lat) * Math.PI * R) / 180;
		return [x, y];
	}

	const points = $derived(fixes.map((fix) => project(fix.lat, fix.lon)));
	const extent = $derived(
		Math.max(50, ...points.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) * 1.15
	);
	const scale = $derived(Math.min(width, height) / 2 / extent);
	const cx = $derived(width / 2);
	const cy = $derived(height / 2);
	function screen([x, y]: [number, number]): [number, number] {
		return [cx + x * scale, cy - y * scale];
	}

	const path = $derived(
		points.map((point, i) => `${i === 0 ? 'M' : 'L'}${screen(point).join(',')}`).join('')
	);
	const ringStep = $derived(niceRingStep(extent));
	const rings = $derived(
		Array.from({ length: Math.floor(extent / ringStep) }, (_, i) => (i + 1) * ringStep)
	);

	const range = $derived(
		current && pad ? distanceMeters(pad.lat, pad.lon, current.lat, current.lon) : null
	);
	const bearing = $derived(
		current && pad ? bearingDegrees(pad.lat, pad.lon, current.lat, current.lon) : null
	);
	const maxRange = $derived(
		pad ? Math.max(0, ...fixes.map((fix) => distanceMeters(pad.lat, pad.lon, fix.lat, fix.lon))) : 0
	);
	const maxAlt = $derived(
		Math.max(...fixes.map((fix) => fix.alt).filter((alt) => Number.isFinite(alt)))
	);

	function distance(meters: number): string {
		return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
	}

	let copied = $state(false);
	async function copyFix() {
		if (!current) return;
		await navigator.clipboard?.writeText(`${current.lat.toFixed(6)}, ${current.lon.toFixed(6)}`);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="gt-root">
	{#if !source}
		<p class="empty">Choose a GPS stream in the properties panel.</p>
	{:else}
		<div class="map" bind:clientWidth={width} bind:clientHeight={height}>
			<svg {width} {height} role="img" aria-label="Ground track relative to the launch site">
				{#each rings as ring (ring)}
					<circle class="ring" {cx} {cy} r={ring * scale} />
					<text class="ring-label" x={cx + ring * scale * 0.707 + 3} y={cy - ring * scale * 0.707}
						>{distance(ring)}</text
					>
				{/each}
				<line class="axis" x1={cx} y1="0" x2={cx} y2={height} />
				<line class="axis" x1="0" y1={cy} x2={width} y2={cy} />
				<text class="north" x={cx + 4} y="14">N</text>
				{#if pad}
					<path class="pad" d="M{cx - 6},{cy + 5} L{cx},{cy - 6} L{cx + 6},{cy + 5} Z" />
				{/if}
				{#if path}<path class="track" d={path} />{/if}
				{#if current}
					{@const [x, y] = screen(project(current.lat, current.lon))}
					<circle class="current" cx={x} cy={y} r="5" />
				{/if}
			</svg>
			{#if fixes.length === 0}
				<p class="overlay">
					{track.error || `Waiting for ${latField}/${lonField} fields on ${source}`}
				</p>
			{/if}
		</div>
		<dl class="readout">
			<div>
				<dt>Position</dt>
				<dd>
					{current ? `${current.lat.toFixed(6)}, ${current.lon.toFixed(6)}` : '—'}
					{#if current}
						<button type="button" onclick={copyFix}>{copied ? 'Copied' : 'Copy'}</button>
					{/if}
				</dd>
			</div>
			<div>
				<dt>From pad</dt>
				<dd>
					{range === null ? '—' : `${distance(range)} @ ${bearing?.toFixed(0).padStart(3, '0')}°`}
				</dd>
			</div>
			<div>
				<dt>Max range</dt>
				<dd>{fixes.length ? distance(maxRange) : '—'}</dd>
			</div>
			<div>
				<dt>Altitude</dt>
				<dd>
					{current && Number.isFinite(current.alt) ? `${current.alt.toFixed(0)} m` : '—'}
					{#if Number.isFinite(maxAlt)}<span class="muted">max {maxAlt.toFixed(0)} m</span>{/if}
				</dd>
			</div>
		</dl>
	{/if}
</div>

<style>
	.gt-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: var(--mcs-font-sans);
	}
	.map {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	svg {
		display: block;
	}
	.ring {
		fill: none;
		stroke: var(--mcs-border);
	}
	.ring-label,
	.north {
		fill: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
		font-size: 10px;
	}
	.north {
		font-weight: 600;
	}
	.axis {
		stroke: color-mix(in srgb, var(--mcs-border) 60%, transparent);
		stroke-dasharray: 2 4;
	}
	.pad {
		fill: var(--mcs-text-muted);
	}
	.track {
		fill: none;
		stroke: var(--mcs-series-1);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.current {
		fill: var(--mcs-series-1);
		stroke: var(--mcs-bg);
		stroke-width: 2;
	}
	.overlay,
	.empty {
		margin: 0;
		padding: 1rem;
		color: var(--mcs-text-muted);
		font-size: 12px;
		text-align: center;
	}
	.overlay {
		position: absolute;
		inset: auto 0 0 0;
	}
	.readout {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 2px 12px;
		margin: 0;
		padding: 6px 10px;
		border-top: 1px solid var(--mcs-border);
	}
	.readout div {
		min-width: 0;
	}
	dt {
		font-size: 10px;
		color: var(--mcs-text-muted);
	}
	dd {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-family: var(--mcs-font-mono);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--mcs-text);
		white-space: nowrap;
	}
	.muted {
		color: var(--mcs-text-muted);
		font-size: 11px;
	}
	button {
		padding: 0 6px;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: inherit;
		font-family: var(--mcs-font-sans);
		font-size: 11px;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--mcs-focus-ring, var(--mcs-accent));
		outline-offset: 2px;
	}
</style>
