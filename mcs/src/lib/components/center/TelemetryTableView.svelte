<script lang="ts">
	import type { TelemetryTableColumn, TelemetryTableProps } from '$lib/objects/types.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import { timeConductorState } from '$lib/stores/timeline.js';
	import { replayClock } from '$lib/stores/replay-session.js';
	import { replayRunId, replaySamplesForStream } from '$lib/stores/run.js';
	import { formatValue } from '$lib/charts/chart-utils.js';
	import { latestAtOrBefore, mergeTimeOrderedSamples } from '$lib/charts/time-alignment.js';
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: TelemetryTableProps }>();

	const columns = $derived(props.columns ?? []);
	const rowLimit = $derived(props.rowLimit ?? 500);
	const POLL_MS = 2000;

	type Row = { ts: number; values: Record<string, number | string> };
	let rows = $state<Row[]>([]);
	let historyError = $state('');
	let historyLoading = $state(false);
	let historyRetry = $state(0);
	const historyBuffer: Record<string, LivePt[]> = {};
	let sortCol = $state<string | null>(null);
	let sortAsc = $state(false);
	let autoScroll = $state(true);
	let tableBody = $state<HTMLElement | null>(null);

	// Ring buffer for live SSE-driven columns
	type LivePt = { timestamp: number; value: number; eventId?: number };
	const liveBuffer: Record<string, LivePt[]> = {};
	const latestEventIdByColumn: Record<string, number> = {};
	let liveRowsTimer: ReturnType<typeof setTimeout> | null = null;

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

		rows = slice.map((point) => {
			const values: Record<string, number | string> = {};
			for (const col of columns) {
				const key = colKey(col);
				const entry = latestAtOrBefore(liveBuffer[key] ?? [], point.timestamp);
				values[key] = entry != null ? entry.value : '—';
			}
			return { ts: point.timestamp, values };
		});
	}

	function scheduleLiveRows(): void {
		if (liveRowsTimer !== null) return;
		liveRowsTimer = setTimeout(() => {
			liveRowsTimer = null;
			buildLiveRows();
		}, 100);
	}

	function fetchData() {
		if (!columns.length) return;
		if ($replayRunId) {
			const seriesByColumn = new Map<
				string,
				{ timestamp: number; value: number; payload: Record<string, unknown> }[]
			>();
			for (const col of columns) {
				const points = replaySamplesForStream(col.streamId, { to: $replayClock.playhead }) ?? [];
				seriesByColumn.set(
					colKey(col),
					points.map((point) => ({
						timestamp: point.timestamp,
						value:
							typeof point[col.field ?? 'value'] === 'number'
								? Number(point[col.field ?? 'value'])
								: point.value,
						payload: point
					}))
				);
			}
			const reference = seriesByColumn.get(colKey(columns[0])) ?? [];
			rows = reference.slice(-rowLimit).map((point) => {
				const values: Record<string, number | string> = {};
				for (const col of columns) {
					const series = seriesByColumn.get(colKey(col)) ?? [];
					const match = latestAtOrBefore(series, point.timestamp);
					values[colKey(col)] = match && Number.isFinite(match.value) ? match.value : '—';
				}
				return { ts: point.timestamp, values };
			});
			return;
		}
		if ($timeConductorState.mode === 'fixed') {
			const playhead =
				$replayClock.mode === 'live' ? $timeConductorState.fixedEnd : $replayClock.playhead;
			const reference = historyBuffer[colKey(columns[0])] ?? [];
			rows = reference
				.filter((point) => point.timestamp <= playhead)
				.slice(-rowLimit)
				.map((point) => {
					const values: Record<string, number | string> = {};
					for (const col of columns) {
						const series = historyBuffer[colKey(col)] ?? [];
						const match = latestAtOrBefore(series, point.timestamp);
						values[colKey(col)] = match?.value ?? '—';
					}
					return { ts: point.timestamp, values };
				});
			return;
		}
		buildLiveRows();
	}

	async function loadHistory(
		projectId: string,
		cols: TelemetryTableColumn[],
		from: number,
		to: number,
		signal: AbortSignal
	) {
		const dataByStream = new Map<string, { timestamp: number; [key: string]: unknown }[]>();
		for (const streamId of [...new Set(cols.map((col) => col.streamId))]) {
			const query = new URLSearchParams({
				from: String(from),
				to: String(to),
				limit: String(Math.max(rowLimit * 4, 500)),
				includeEventIds: '1'
			});
			const response = await fetch(
				`/api/projects/${projectId}/streams/${encodeURIComponent(streamId)}/samples?${query}`,
				{ signal }
			);
			if (!response.ok) throw new Error(`History query failed for ${streamId}`);
			const body = await response.json();
			dataByStream.set(streamId, Array.isArray(body.data) ? body.data : []);
		}
		if (signal.aborted) return;
		for (const col of cols) {
			const field = col.field ?? 'value';
			historyBuffer[colKey(col)] = (dataByStream.get(col.streamId) ?? [])
				.map((sample) => ({
					timestamp: sample.timestamp,
					value: Number(sample[field] ?? sample.value),
					...(typeof sample.eventId === 'number' ? { eventId: sample.eventId } : {})
				}))
				.filter((sample) => Number.isFinite(sample.value));
		}
		historyError = '';
		fetchData();
	}

	// SSE subscription for live columns, plus historical seed
	$effect(() => {
		if ($replayRunId || $timeConductorState.mode === 'fixed') return;
		const proj = $currentProject;
		const cols = columns;
		if (!proj || !cols.length) return;

		const liveCols = cols;
		if (!liveCols.length) return;

		// ── Seed liveBuffer from historical REST samples ──────────────────────
		const seenForSeed = new Set<string>();
		for (const col of liveCols) {
			const key = colKey(col);
			const field = col.field ?? 'value';
			if (seenForSeed.has(key)) continue;
			seenForSeed.add(key);
			const load = fetch(
				`/api/projects/${encodeURIComponent(proj.id)}/streams/${encodeURIComponent(col.streamId)}/samples?limit=${rowLimit}&includeEventIds=1`
			).then((r) => (r.ok ? r.json() : { data: [] }));
			load
				.then(
					(body: {
						data?: { timestamp: number; value?: number; eventId?: number; [k: string]: unknown }[];
					}) => {
						const pts: LivePt[] = (body.data ?? [])
							.map((s) => ({
								timestamp: s.timestamp,
								value:
									typeof s[field] === 'number'
										? (s[field] as number)
										: typeof s.value === 'number'
											? s.value
											: NaN,
								...(s.eventId === undefined ? {} : { eventId: s.eventId })
							}))
							.filter((p) => isUsableNumber(p.value));
						if (pts.length) {
							liveBuffer[key] = mergeTimeOrderedSamples(liveBuffer[key] ?? [], pts, rowLimit);
							for (const point of pts) {
								if (point.eventId !== undefined) {
									latestEventIdByColumn[key] = Math.max(
										latestEventIdByColumn[key] ?? 0,
										point.eventId
									);
								}
							}
							scheduleLiveRows();
						}
					}
				)
				.catch(() => {});
		}

		// ── Live SSE subscription ────────────────────────────────────────────
		const unsubs: (() => void)[] = [];
		const seenStreams = new Set<string>();

		for (const col of liveCols) {
			if (seenStreams.has(col.streamId)) continue;
			seenStreams.add(col.streamId);

			const unsub = subscribeSSE(proj.id, col.streamId, (event) => {
				if (!('values' in event)) return;
				const samples = event.samples ?? [
					{
						timestamp: event.timestamp,
						values: event.values,
						eventId: event.eventId
					}
				];

				// Populate all columns tied to this stream
				for (const c of cols) {
					if (c.streamId !== event.streamId) continue;
					const field = c.field ?? 'value';
					const key = colKey(c);
					const incoming: LivePt[] = [];
					for (const sample of samples) {
						const rawVal = sample.values[field] ?? sample.values.value;
						if (rawVal === undefined) continue;
						const val = Number(rawVal);
						if (!isUsableNumber(val)) continue;
						incoming.push({
							timestamp: sample.timestamp,
							value: val,
							...(sample.eventId === undefined ? {} : { eventId: sample.eventId })
						});
					}
					liveBuffer[key] = mergeTimeOrderedSamples(liveBuffer[key] ?? [], incoming, rowLimit);
					for (const point of incoming) {
						if (point.eventId !== undefined) {
							latestEventIdByColumn[key] = Math.max(latestEventIdByColumn[key] ?? 0, point.eventId);
						}
					}
				}
				scheduleLiveRows();
			});
			unsubs.push(unsub);
		}
		return () => {
			for (const u of unsubs) u();
			if (liveRowsTimer !== null) clearTimeout(liveRowsTimer);
			liveRowsTimer = null;
		};
	});

	$effect(() => {
		const project = $currentProject;
		const state = $timeConductorState;
		const cols = columns;
		historyRetry;
		if (!project || state.mode !== 'fixed' || $replayRunId || cols.length === 0) return;
		const controller = new AbortController();
		historyError = '';
		historyLoading = true;
		rows = [];
		const timer = setTimeout(() => {
			void loadHistory(project.id, cols, state.fixedStart, state.fixedEnd, controller.signal)
				.catch((cause) => {
					if (!controller.signal.aborted)
						historyError = cause instanceof Error ? cause.message : 'History query failed';
				})
				.finally(() => {
					if (!controller.signal.aborted) historyLoading = false;
				});
		}, 100);
		return () => {
			clearTimeout(timer);
			controller.abort();
			historyLoading = false;
		};
	});

	$effect(() => {
		if ($replayRunId) {
			$replayClock.playhead;
			fetchData();
			return;
		}
		if ($timeConductorState.mode === 'fixed') {
			$replayClock.playhead;
			fetchData();
			return;
		}
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
		const d = new Date(ts * 1000);
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
		{#if $timeConductorState.mode === 'fixed' && !$replayRunId && historyError}
			<div class="history-message" role="status">
				<span>{historyError}</span>
				<button type="button" onclick={() => (historyRetry += 1)}>Retry</button>
			</div>
		{:else if $timeConductorState.mode === 'fixed' && !$replayRunId && historyLoading}
			<div class="history-message" role="status">Loading history…</div>
		{:else if $timeConductorState.mode === 'fixed' && !$replayRunId && rows.length === 0 && columns.length > 0}
			<div class="history-message" role="status">No samples in this time window.</div>
		{/if}
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
				{#each sortedRows as row, rowIndex (row.ts + ':' + rowIndex)}
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
	.history-message {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		min-height: 2.5rem;
		padding: 0.5rem;
		color: var(--mcs-text-muted);
		font-size: 0.75rem;
	}
	.history-message button {
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		padding: 0.25rem 0.5rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.history-message button:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
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
		accent-color: var(--mcs-accent, #1a1a1a);
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
		color: var(--mcs-text);
		background: color-mix(in srgb, var(--mcs-warning, #777777) 16%, transparent);
	}
	td.severity-alarm {
		color: var(--mcs-text);
		background: color-mix(in srgb, var(--mcs-danger, #222222) 16%, transparent);
	}

	.ts-col {
		width: 90px;
		min-width: 60px;
		color: var(--mcs-text-muted);
	}

	tr:hover td {
		background: color-mix(in srgb, var(--mcs-accent, #1a1a1a) 6%, transparent);
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
