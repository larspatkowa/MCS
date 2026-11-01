<script lang="ts">
	import type { ValuesTableProps } from '$lib/objects/types.js';
	import { currentProject } from '$lib/stores/project.js';
	import { formatValue } from '$lib/charts/chart-utils.js';
	import { useLatestValues, useStreamCatalog } from '$lib/telemetry/live-data.svelte.js';

	let { props } = $props<{ objectId: string; props: ValuesTableProps }>();

	const streams = $derived<string[]>((props.dataSources ?? []).filter(Boolean));
	const fieldFilter = $derived(
		(props.fields ?? '')
			.split(',')
			.map((field: string) => field.trim())
			.filter(Boolean)
	);
	const precision = $derived(props.precision ?? 3);
	const staleAfter = $derived(props.staleAfterSec ?? 5);

	const data = useLatestValues(() => streams);
	const catalog = useStreamCatalog();

	type Limit = {
		field: string;
		yellowLow: number | null;
		yellowHigh: number | null;
		redLow: number | null;
		redHigh: number | null;
		enabled: boolean;
	};
	let limits = $state<Record<string, Limit[]>>({});

	$effect(() => {
		const projectId = $currentProject?.id;
		const ids = streams;
		if (!projectId) return;
		const controller = new AbortController();
		Promise.all(
			ids.map(async (id) => {
				const response = await fetch(
					`/api/projects/${projectId}/streams/${encodeURIComponent(id)}/limits`,
					{ signal: controller.signal }
				);
				return [id, response.ok ? ((await response.json()) as Limit[]) : []] as const;
			})
		)
			.then((entries) => (limits = Object.fromEntries(entries)))
			.catch(() => {});
		return () => controller.abort();
	});

	// Wall clock for the age column. One tick per second is enough.
	let now = $state(Date.now() / 1000);
	$effect(() => {
		const timer = setInterval(() => (now = Date.now() / 1000), 1000);
		return () => clearInterval(timer);
	});

	type Severity = 'normal' | 'warning' | 'alarm';

	function severityOf(streamId: string, field: string, value: unknown): Severity {
		if (typeof value !== 'number') return 'normal';
		const limit = limits[streamId]?.find((entry) => entry.field === field && entry.enabled);
		if (!limit) return 'normal';
		if (
			(limit.redLow != null && value <= limit.redLow) ||
			(limit.redHigh != null && value >= limit.redHigh)
		)
			return 'alarm';
		if (
			(limit.yellowLow != null && value <= limit.yellowLow) ||
			(limit.yellowHigh != null && value >= limit.yellowHigh)
		)
			return 'warning';
		return 'normal';
	}

	const rows = $derived(
		streams.flatMap((streamId: string) => {
			const sample = data.latest[streamId];
			const fields = sample
				? Object.keys(sample.values).filter(
						(field) =>
							(fieldFilter.length === 0 || fieldFilter.includes(field)) &&
							['number', 'string', 'boolean'].includes(typeof sample.values[field])
					)
				: fieldFilter.length
					? fieldFilter
					: ['value'];
			return fields.map((field: string) => {
				const value = sample?.values[field];
				return {
					key: `${streamId}\u0000${field}`,
					name:
						fields.length === 1 && field === 'value'
							? catalog.nameFor(streamId)
							: `${catalog.nameFor(streamId)} · ${field}`,
					value,
					unit: catalog.unitFor(streamId, field),
					timestamp: sample?.timestamp,
					severity: severityOf(streamId, field, value)
				};
			});
		})
	);

	function display(value: unknown): string {
		if (value === undefined || value === null) return '—';
		if (typeof value === 'number') return formatValue(value, precision);
		return String(value);
	}

	function utc(timestamp: number | undefined): string {
		if (timestamp === undefined) return '—';
		return new Date(timestamp * 1000).toISOString().slice(11, 23);
	}

	function age(timestamp: number | undefined): string {
		if (timestamp === undefined || data.mode !== 'live') return '';
		const seconds = Math.max(0, now - timestamp);
		if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
		return `${Math.floor(seconds / 3600)} h`;
	}

	function isStale(timestamp: number | undefined): boolean {
		return data.mode === 'live' && timestamp !== undefined && now - timestamp > staleAfter;
	}
</script>

<div class="vt-root">
	{#if streams.length === 0}
		<p class="empty">Choose streams in the properties panel to list their newest values.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th scope="col">Telemetry</th>
					<th scope="col" class="num">Value</th>
					<th scope="col">Unit</th>
					<th scope="col">Time (UTC)</th>
					{#if data.mode === 'live'}<th scope="col" class="num">Age</th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.key)}
					<tr class:stale={isStale(row.timestamp)}>
						<th scope="row">{row.name}</th>
						<td class="num value {row.severity}">
							{#if row.severity !== 'normal'}
								<span class="tag">{row.severity === 'alarm' ? 'CRIT' : 'WARN'}</span>
							{/if}
							{display(row.value)}
						</td>
						<td class="unit">{row.unit}</td>
						<td class="time">{utc(row.timestamp)}</td>
						{#if data.mode === 'live'}
							<td class="num age">
								{#if isStale(row.timestamp)}<span class="tag stale-tag">STALE</span>{/if}
								{age(row.timestamp)}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
		{#if data.error}<p class="error" role="status">{data.error}</p>{/if}
	{/if}
</div>

<style>
	.vt-root {
		width: 100%;
		height: 100%;
		overflow: auto;
		font-family: var(--mcs-font-sans);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 5px 8px;
		text-align: left;
		font-size: 10px;
		font-weight: 500;
		color: var(--mcs-text-muted);
		background: var(--mcs-surface);
		border-bottom: 1px solid var(--mcs-border);
		white-space: nowrap;
	}
	tbody th {
		padding: 4px 8px;
		text-align: left;
		font-weight: 400;
		font-size: 12px;
		color: var(--mcs-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 22ch;
	}
	td {
		padding: 4px 8px;
		font-family: var(--mcs-font-mono);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--mcs-text);
		white-space: nowrap;
	}
	tbody tr {
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
	}
	.num {
		text-align: right;
	}
	.value {
		font-size: 13px;
		font-weight: 600;
	}
	.value.warning {
		color: var(--mcs-warning);
	}
	.value.alarm {
		color: var(--mcs-danger);
	}
	.unit,
	.time,
	.age {
		color: var(--mcs-text-muted);
	}
	.tag {
		display: inline-block;
		margin-right: 6px;
		padding: 0 4px;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.04em;
		vertical-align: 1px;
	}
	tr.stale th,
	tr.stale .value {
		color: var(--mcs-text-muted);
	}
	.stale-tag {
		color: var(--mcs-warning);
	}
	.empty,
	.error {
		margin: 0;
		padding: 1.5rem 1rem;
		font-size: 12px;
		color: var(--mcs-text-muted);
		text-align: center;
	}
</style>
