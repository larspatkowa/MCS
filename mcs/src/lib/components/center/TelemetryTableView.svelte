<script lang="ts">
	import type { TelemetryTableColumn, TelemetryTableProps } from '$lib/objects/types.js';
	import { getSampleStreamSeries, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import { formatValue } from '$lib/charts/chart-utils.js';
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: TelemetryTableProps }>();

	const columns = $derived(props.columns ?? []);
	const rowLimit = $derived(props.rowLimit ?? 500);
	const POLL_MS = 2000;
	const WINDOW_SEC = 120;

	type Row = { ts: number; values: Record<string, number | string> };
	let rows = $state<Row[]>([]);
	let sortCol = $state<string | null>(null);
	let sortAsc = $state(false);
	let autoScroll = $state(true);
	let tableBody = $state<HTMLElement | null>(null);

	// Ring buffer for live SSE-driven columns (non-sample streams)
	type LivePt = { ts: number; value: number };
	const liveBuffer: Record<string, LivePt[]> = {};

	function isUsableNumber(input: unknown): input is number {
		return (
			typeof input === 'number' &&
			Number.isFinite(input) &&
			Math.abs(input) <= Number.MAX_SAFE_INTEGER
		);
	}

	function colKey(col: { streamId: string; field?: string }): string {
		return `${col.streamId}:${col.field ?? 'value'}`;
	}

	function getCellSeverity(
		col: TelemetryTableColumn,
		value: number | string
	): 'normal' | 'warning' | 'alarm' {
		if (typeof value !== 'number' || Number.isNaN(value)) return 'normal';
		if (col.alarmBelow != null && value <= col.alarmBelow) return 'alarm';
		if (col.alarmAbove != null && value >= col.alarmAbove) return 'alarm';
		if (col.warningBelow != null && value <= col.warningBelow) return 'warning';
		if (col.warningAbove != null && value >= col.warningAbove) return 'warning';
		return 'normal';
	}

	function buildLiveRows() {
		if (!columns.length) return;
		const refKey = colKey(columns[0]);
		const refBuf = liveBuffer[refKey] ?? [];
		const limit = Math.min(refBuf.length, rowLimit);
		const slice = refBuf.slice(-limit);

		rows = slice.map((pt, i) => {
			const values: Record<string, number | string> = {};
			for (const col of columns) {
				const key = colKey(col);
				const buf = liveBuffer[key] ?? [];
				const entry = buf[buf.length - limit + i];
				values[key] = entry != null ? entry.value : '—';
			}
			return { ts: pt.ts, values };
		});
	}

	function fetchData() {
		if (!columns.length) return;
		// Sample-stream path: build rows directly from in-memory generators
		const refCol = columns[0];
		if (!refCol || !isSampleStreamId(refCol.streamId)) return;

		const refSeries = getSampleStreamSeries(refCol.streamId, {
			windowSec: WINDOW_SEC,
			points: Math.min(rowLimit, 200)
		});

		const sampleSeries: Record<string, { timestamp: number; value: number }[]> = {};
		for (const col of columns) {
			if (isSampleStreamId(col.streamId)) {
				sampleSeries[colKey(col)] = getSampleStreamSeries(col.streamId, {
					windowSec: WINDOW_SEC,
					points: Math.min(rowLimit, 200)
				});
			}
		}

		const newRows: Row[] = refSeries.map((pt, i) => {
			const values: Record<string, number | string> = {};
			for (const col of columns) {
				const key = colKey(col);
				const series = sampleSeries[key];
				if (series && series[i]) {
					values[key] = series[i].value;
				} else {
					values[key] = '—';
				}
			}
			return { ts: pt.timestamp, values };
		});

		rows = newRows;
	}

	// SSE subscription for non-sample (plugin) columns, plus historical seed
	$effect(() => {
		const proj = $currentProject;
		const cols = columns;
		if (!proj || !cols.length) return;

		const pluginCols = cols.filter((c: any) => !isSampleStreamId(c.streamId));
		if (!pluginCols.length) return;

		// ── Seed liveBuffer from historical REST samples ──────────────────────
		const seenForSeed = new Set<string>();
		for (const col of pluginCols) {
			const key = colKey(col);
			const field = col.field ?? 'value';
			if (seenForSeed.has(key)) continue;
			seenForSeed.add(key);
			const load = fetch(
						`/api/projects/${proj.id}/streams/${encodeURIComponent(col.streamId)}/samples?limit=${rowLimit}`
					).then((r) => (r.ok ? r.json() : { data: [] }));
			load.then((body: { data?: { timestamp: number; value?: number; [k: string]: unknown }[] }) => {
					const pts: LivePt[] = (body.data ?? [])
						.map((s) => ({
							ts: s.timestamp,
							value:
								typeof s[field] === 'number'
									? (s[field] as number)
									: typeof s.value === 'number'
										? s.value
										: NaN
						}))
						.filter((p) => isUsableNumber(p.value));
					if (pts.length) {
						liveBuffer[key] = pts.slice(-rowLimit);
						buildLiveRows();
					}
				}).catch(() => {});
		}

		// ── Live SSE subscription ────────────────────────────────────────────
		const unsubs: (() => void)[] = [];
		const seenStreams = new Set<string>();

		for (const col of pluginCols) {
			if (seenStreams.has(col.streamId)) continue;
			seenStreams.add(col.streamId);

			const unsub = subscribeSSE(proj.id, col.streamId, (event) => {
				if (!('values' in event)) return;
				const ev = event.values as Record<string, unknown>;

				// Populate all columns tied to this stream
				for (const c of cols) {
					if (c.streamId !== event.streamId) continue;
					const field = c.field ?? 'value';
					const key = colKey(c);
					const rawVal = ev[field] ?? ev['value'];
					if (rawVal === undefined) continue;
					const val = Number(rawVal);
					if (!isUsableNumber(val)) continue;
					const buf = liveBuffer[key] ?? [];
					buf.push({ ts: event.timestamp, value: val });
					if (buf.length > rowLimit) buf.splice(0, buf.length - rowLimit);
					liveBuffer[key] = buf;
				}
				buildLiveRows();
			});
			unsubs.push(unsub);
		}
		return () => {
			for (const u of unsubs) u();
		};
	});

	$effect(() => {
		fetchData();
		const id = setInterval(fetchData, POLL_MS);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (autoScroll && tableBody) {
			tableBody.scrollTop = tableBody.scrollHeight;
		}
	});

	const sortedRows = $derived.by(() => {
		if (!sortCol) return rows;
		const sorted = [...rows];
		sorted.sort((a, b) => {
			const av = sortCol === '__ts' ? a.ts : (a.values[sortCol!] ?? 0);
			const bv = sortCol === '__ts' ? b.ts : (b.values[sortCol!] ?? 0);
			if (typeof av === 'number' && typeof bv === 'number') {
				return sortAsc ? av - bv : bv - av;
			}
			return 0;
		});
		return sorted;
	});

	function toggleSort(col: string) {
		if (sortCol === col) {
			sortAsc = !sortAsc;
		} else {
			sortCol = col;
			sortAsc = true;
		}
	}

	function formatTs(ts: number): string {
		const d = new Date(ts);
		return d.toISOString().slice(11, 23);
	}
</script>

<div class="tt-root telemetry-table-view">
	<div class="tt-header">
		<span class="tt-count">{rows.length} rows</span>
		<label class="tt-auto">
			<input type="checkbox" bind:checked={autoScroll} />
			Auto-scroll
		</label>
	</div>
	<div class="tt-body" bind:this={tableBody}>
		<table class="data-table">
			<thead>
				<tr>
					<th class="ts-col" onclick={() => toggleSort('__ts')}>
						Timestamp
						{#if sortCol === '__ts'}
							{#if sortAsc}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
						{/if}
					</th>
					{#each columns as col}
						{@const key = colKey(col)}
						<th onclick={() => toggleSort(key)}>
							{col.label || col.streamId}
							{#if sortCol === key}
								{#if sortAsc}<ChevronUp size={12} />{:else}<ChevronDown size={12} />{/if}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sortedRows as row (row.ts)}
					<tr>
						<td class="ts-col">{formatTs(row.ts)}</td>
						{#each columns as col}
							{@const key = colKey(col)}
							{@const v = row.values[key]}
							{@const severity = getCellSeverity(col, v)}
							<td
								class:num={typeof v === 'number'}
								class:severity-warning={severity === 'warning'}
								class:severity-alarm={severity === 'alarm'}
							>
								{typeof v === 'number' ? formatValue(v, 2) : v}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
		{#if columns.length === 0}
			<div class="empty">Add columns in properties to display telemetry</div>
		{/if}
	</div>
</div>

<style>
	.tt-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--mcs-font-sans);
	}

	.tt-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 10px;
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}

	.tt-count {
		font-size: 10px;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
	}

	.tt-auto {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		color: var(--mcs-text-muted);
		cursor: pointer;
	}

	.tt-auto input {
		accent-color: var(--mcs-accent, #4f9cf9);
	}

	.tt-body {
		flex: 1;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}

	thead {
		position: sticky;
		top: 0;
		z-index: 2;
	}

	th {
		padding: 5px 8px;
		text-align: left;
		font-weight: 500;
		color: var(--mcs-text-muted);
		background: var(--mcs-surface);
		border-bottom: 1px solid var(--mcs-border);
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
		font-family: var(--mcs-font-sans);
		font-size: 10px;
	}

	th:hover {
		color: var(--mcs-text);
	}

	td {
		padding: 3px 8px;
		color: var(--mcs-text);
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
		font-family: var(--mcs-font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	td.num {
		text-align: right;
	}
	td.severity-warning {
		color: #fbbf24;
		background: color-mix(in srgb, #f59e0b 16%, transparent);
	}
	td.severity-alarm {
		color: #fca5a5;
		background: color-mix(in srgb, #ef4444 16%, transparent);
	}

	.ts-col {
		width: 90px;
		min-width: 60px;
		color: var(--mcs-text-muted);
	}

	tr:hover td {
		background: color-mix(in srgb, var(--mcs-accent, #4f9cf9) 6%, transparent);
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 12px;
		padding: 2rem;
	}
</style>
