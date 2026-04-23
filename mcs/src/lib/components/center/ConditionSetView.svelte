<script lang="ts">
	import type { ConditionSetProps, Condition, ConditionOp } from '$lib/objects/types.js';
	import { getSampleStreamValue, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { formatValue } from '$lib/charts/chart-utils.js';
	import { CircleCheck, CircleAlert, LayoutDashboard } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: ConditionSetProps }>();

	const conditions = $derived(props.conditions ?? []);
	const mode = $derived(props.mode ?? 'widget');
	const label = $derived(props.label ?? 'Conditions');
	const POLL_MS = 1500;

	type EvalResult = { condition: Condition; value: number; result: boolean };
	let results = $state<EvalResult[]>([]);

	function evaluate(cond: Condition, value: number): boolean {
		const v = cond.value ?? 0;
		const v2 = cond.value2 ?? 0;
		switch (cond.op) {
			case 'gt':
				return value > v;
			case 'lt':
				return value < v;
			case 'gte':
				return value >= v;
			case 'lte':
				return value <= v;
			case 'eq':
				return Math.abs(value - v) < 0.001;
			case 'neq':
				return Math.abs(value - v) >= 0.001;
			case 'between':
				return value >= v && value <= v2;
			default:
				return false;
		}
	}

	function opLabel(op: ConditionOp): string {
		switch (op) {
			case 'gt':
				return '>';
			case 'lt':
				return '<';
			case 'gte':
				return '≥';
			case 'lte':
				return '≤';
			case 'eq':
				return '=';
			case 'neq':
				return '≠';
			case 'between':
				return '∈';
			default:
				return op;
		}
	}

	function fetchResults() {
		results = conditions.map((cond: Condition) => {
			let value = 0;
			if (isSampleStreamId(cond.streamId)) {
				value = getSampleStreamValue(cond.streamId);
			}
			return { condition: cond, value, result: evaluate(cond, value) };
		});
	}

	$effect(() => {
		fetchResults();
		const id = setInterval(fetchResults, POLL_MS);
		return () => clearInterval(id);
	});

	const allPass = $derived(results.every((r: EvalResult) => r.result));
	const failCount = $derived(results.filter((r: EvalResult) => !r.result).length);
</script>

<div class="cs-root cs-{mode}">
	<ErrorBoundary>
		{#if mode === 'widget'}
			<!-- Summary widget mode -->
			<div class="widget" class:widget-pass={allPass} class:widget-fail={!allPass}>
				<div class="widget-icon">
					{#if allPass}
						<CircleCheck size={28} />
					{:else}
						<CircleAlert size={28} />
					{/if}
				</div>
				<div class="widget-info">
					<span class="widget-label">{label}</span>
					<span class="widget-status">
						{#if allPass}
							All {conditions.length} conditions met
						{:else}
							{failCount} of {conditions.length} conditions failed
						{/if}
					</span>
				</div>
			</div>
			<!-- Compact row beneath -->
			{#each results as r}
				<div class="widget-row" class:row-pass={r.result} class:row-fail={!r.result}>
					<span
						class="row-dot"
						style="background:{r.result
							? (r.condition.colorTrue ?? '#22c55e')
							: (r.condition.colorFalse ?? '#ef4444')}"
					></span>
					<span class="row-label">{r.condition.label || r.condition.streamId}</span>
					<span class="row-val"
						>{formatValue(r.value, 2)}
						{opLabel(r.condition.op)}
						{r.condition.value ?? ''}{r.condition.op === 'between'
							? `–${r.condition.value2 ?? ''}`
							: ''}</span
					>
					<span class="row-out"
						>{r.result
							? (r.condition.outputTrue ?? 'PASS')
							: (r.condition.outputFalse ?? 'FAIL')}</span
					>
				</div>
			{/each}
		{:else}
			<!-- Table mode -->
			<div class="table-body">
				<table>
					<thead>
						<tr>
							<th>Condition</th>
							<th>Stream</th>
							<th>Value</th>
							<th>Op</th>
							<th>Threshold</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{#each results as r}
							<tr class:row-pass={r.result} class:row-fail={!r.result}>
								<td>{r.condition.label || '—'}</td>
								<td class="mono">{r.condition.streamId}</td>
								<td class="mono">{formatValue(r.value, 2)}</td>
								<td class="mono">{opLabel(r.condition.op)}</td>
								<td class="mono"
									>{r.condition.value ?? ''}{r.condition.op === 'between'
										? `–${r.condition.value2 ?? ''}`
										: ''}</td
								>
								<td>
									<span
										class="status-badge"
										style="background:{r.result
											? (r.condition.colorTrue ?? '#22c55e')
											: (r.condition.colorFalse ?? '#ef4444')}"
									>
										{r.result
											? (r.condition.outputTrue ?? 'PASS')
											: (r.condition.outputFalse ?? 'FAIL')}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		{#if conditions.length === 0}
			<div class="empty">
				<LayoutDashboard size={20} />
				<span>Add conditions in properties</span>
			</div>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.cs-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: auto;
		font-family: var(--mcs-font-sans);
	}

	/* Widget mode */
	.widget {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--mcs-border);
	}

	.widget-pass {
		background: color-mix(in srgb, #22c55e 8%, var(--mcs-surface));
	}
	.widget-pass .widget-icon {
		color: #22c55e;
	}

	.widget-fail {
		background: color-mix(in srgb, #ef4444 8%, var(--mcs-surface));
	}
	.widget-fail .widget-icon {
		color: #ef4444;
	}

	.widget-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.widget-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--mcs-text);
	}

	.widget-status {
		font-size: 11px;
		color: var(--mcs-text-muted);
	}

	.widget-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 16px;
		font-size: 11px;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
	}

	.row-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.row-label {
		flex: 1;
		color: var(--mcs-text);
	}

	.row-val {
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		font-size: 10px;
	}

	.row-out {
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		font-weight: 600;
	}

	.row-pass .row-out {
		color: #22c55e;
	}
	.row-fail .row-out {
		color: #ef4444;
	}

	.table-body {
		flex: 1;
		overflow: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}

	th {
		padding: 5px 8px;
		text-align: left;
		font-weight: 500;
		font-size: 10px;
		color: var(--mcs-text-muted);
		background: var(--mcs-surface);
		border-bottom: 1px solid var(--mcs-border);
		position: sticky;
		top: 0;
	}

	td {
		padding: 4px 8px;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
		color: var(--mcs-text);
	}

	td.mono {
		font-family: var(--mcs-font-mono);
		font-variant-numeric: tabular-nums;
	}

	.status-badge {
		display: inline-block;
		padding: 1px 8px;
		border-radius: 8px;
		font-size: 9px;
		font-weight: 700;
		color: #fff;
		letter-spacing: 0.04em;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 12px;
		padding: 2rem;
	}
</style>
