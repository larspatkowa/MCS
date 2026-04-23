<script lang="ts">
	import type { SummaryWidgetProps, SummaryWidgetRule } from '$lib/objects/types.js';
	import { getSampleStreamValue, isSampleStreamId } from '$lib/charts/sample-streams.js';
	import { evalOp, getStreamValue, setStreamValue } from '$lib/charts/condition-eval.js';
	import { formatValue } from '$lib/charts/chart-utils.js';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { currentProject } from '$lib/stores/project.js';
	import { ShieldCheck, ShieldAlert, ShieldX } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';

	let { objectId, props } = $props<{ objectId: string; props: SummaryWidgetProps }>();

	const rules = $derived<SummaryWidgetRule[]>(props.rules ?? []);
	const okLabel = $derived(props.okLabel ?? 'Nominal');
	const okDetail = $derived(props.okDetail ?? '');
	const okColor = $derived(props.okColor ?? '#22c55e');
	const showDetail = $derived(props.showDetail !== false);
	const ruleOrder = $derived(props.ruleOrder ?? 'configured');

	let liveValues = $state<Record<string, number>>({});
	let samplePollTick = $state(0);

	const POLL_MS = 1500;

	type RuleSeverity = 'critical' | 'warning';
	type RuleStatus = 'waiting' | 'idle' | 'active';
	type EvaluatedRule = SummaryWidgetRule & {
		currentValue: number | null;
		thresholdValue: number;
		status: RuleStatus;
		triggered: boolean;
		severity: RuleSeverity;
	};

	function isUsableNumber(value: unknown): value is number {
		return (
			typeof value === 'number' &&
			Number.isFinite(value) &&
			Math.abs(value) <= Number.MAX_SAFE_INTEGER
		);
	}

	function extractNumericValue(values: Record<string, unknown>): number | null {
		if (isUsableNumber(values.value)) return values.value;
		for (const key of Object.keys(values)) {
			const numeric = Number(values[key]);
			if (isUsableNumber(numeric)) return numeric;
		}
		return null;
	}

	function formatStreamId(id: string): string {
		const colon = id.indexOf(':');
		return colon >= 0 ? id.slice(colon + 1) : id;
	}

	function opLabel(op: string): string {
		switch (op) {
			case 'gt':
				return '>';
			case 'lt':
				return '<';
			case 'gte':
				return '>=';
			case 'lte':
				return '<=';
			case 'eq':
				return '=';
			case 'neq':
				return '!=';
			case 'between':
				return 'between';
			default:
				return op;
		}
	}

	function conditionText(rule: EvaluatedRule): string {
		if (rule.op === 'between') {
			const low = formatValue(rule.thresholdValue, 2);
			const high = formatValue(rule.value2 ?? 0, 2);
			return `between ${low}–${high}`;
		}
		return `${opLabel(rule.op)} ${formatValue(rule.thresholdValue, 2)}`;
	}

	function observedText(rule: EvaluatedRule): string {
		if (rule.currentValue == null) return 'waiting';
		return formatValue(rule.currentValue, 2);
	}

	function currentValueForRule(rule: SummaryWidgetRule): number | null {
		if (isSampleStreamId(rule.streamId)) {
			const sampleValue = getSampleStreamValue(rule.streamId);
			return isUsableNumber(sampleValue) ? sampleValue : null;
		}
		const liveValue = liveValues[rule.streamId];
		if (isUsableNumber(liveValue)) return liveValue;
		const cachedValue = getStreamValue(rule.streamId);
		return isUsableNumber(cachedValue) ? cachedValue : null;
	}

	function severityForRule(rule: SummaryWidgetRule): RuleSeverity {
		const color = (rule.color ?? '').trim().toLowerCase();
		if (
			color === 'red' ||
			color === '#ef4444' ||
			color === '#f85149' ||
			color === '#dc2626' ||
			color.includes('rgb(239, 68, 68)')
		) {
			return 'critical';
		}
		return 'warning';
	}

	const evaluatedRules = $derived.by((): EvaluatedRule[] => {
		samplePollTick;
		return rules.map((rule: SummaryWidgetRule): EvaluatedRule => {
			const thresholdValue = rule.threshold ?? rule.value ?? 0;
			const currentValue = currentValueForRule(rule);
			const triggered =
				currentValue != null ? evalOp(rule.op, currentValue, thresholdValue, rule.value2) : false;
			return {
				...rule,
				currentValue,
				thresholdValue,
				triggered,
				status: currentValue == null ? 'waiting' : triggered ? 'active' : 'idle',
				severity: severityForRule(rule)
			};
		});
	});

	const firedRule = $derived(evaluatedRules.find((rule: EvaluatedRule) => rule.triggered) ?? null);
	const waitingCount = $derived(
		evaluatedRules.filter((rule: EvaluatedRule) => rule.status === 'waiting').length
	);
	const displayedRules = $derived.by(() => {
		if (ruleOrder !== 'severity') return evaluatedRules;
		return [...evaluatedRules].sort((a, b) => {
			const rank = (rule: EvaluatedRule) => {
				if (rule.status === 'active' && rule.severity === 'critical') return 0;
				if (rule.status === 'active' && rule.severity === 'warning') return 1;
				if (rule.status === 'idle') return 2;
				return 3;
			};
			const byRank = rank(a) - rank(b);
			if (byRank !== 0) return byRank;
			return (a.label ?? '').localeCompare(b.label ?? '');
		});
	});
	const bannerColor = $derived(firedRule ? firedRule.color : okColor);
	const bannerLabel = $derived(firedRule ? firedRule.label : okLabel);
	const severity = $derived(firedRule ? firedRule.severity : 'ok');
	const bannerDetail = $derived.by(() => {
		if (!showDetail) return '';
		if (firedRule) {
			const metric = formatStreamId(firedRule.streamId);
			const cond = conditionText(firedRule);
			const observed = observedText(firedRule);
			return `${metric} ${cond} · now ${observed}`;
		}
		if (waitingCount > 0) {
			return `Waiting on ${waitingCount} live stream${waitingCount === 1 ? '' : 's'}`;
		}
		return okDetail.trim();
	});

	$effect(() => {
		const id = setInterval(() => {
			samplePollTick += 1;
		}, POLL_MS);
		return () => clearInterval(id);
	});

	$effect(() => {
		const proj = $currentProject;
		if (!proj) return;

		const streamIds = [
			...new Set(
				rules
					.map((rule: SummaryWidgetRule) => rule.streamId)
					.filter((streamId: string) => !isSampleStreamId(streamId))
			)
		] as string[];
		if (streamIds.length === 0) return;

		const seedUnsubs: Array<() => void> = [];
		for (const streamId of streamIds) {
			const sid = encodeURIComponent(streamId);
			fetch(`/api/projects/${proj.id}/streams/${sid}`)
				.then((response) => (response.ok ? response.json() : null))
				.then((payload: { lastValue?: unknown } | null) => {
					if (!isUsableNumber(payload?.lastValue)) return;
					liveValues = { ...liveValues, [streamId]: payload.lastValue };
					setStreamValue(streamId, payload.lastValue);
				})
				.catch(() => {});

			seedUnsubs.push(
				subscribeSSE(proj.id, streamId, (event) => {
					if (!('values' in event)) return;
					const numericValue = extractNumericValue(event.values as Record<string, unknown>);
					if (numericValue == null) return;
					liveValues = { ...liveValues, [streamId]: numericValue };
					setStreamValue(streamId, numericValue);
				})
			);
		}

		return () => seedUnsubs.forEach((unsubscribe) => unsubscribe());
	});
</script>

<div class="sw-root">
	<ErrorBoundary>
		<div class="banner" style="--sw-color: {bannerColor}">
			<div class="icon-wrap">
				{#if severity === 'critical'}
					<ShieldX size={22} />
				{:else if severity === 'warning'}
					<ShieldAlert size={22} />
				{:else}
					<ShieldCheck size={22} />
				{/if}
			</div>
			<div class="banner-text">
				<span class="banner-label">{bannerLabel}</span>
				{#if bannerDetail}
					<span class="banner-detail">{bannerDetail}</span>
				{/if}
			</div>
		</div>

		{#if rules.length > 0}
			<div class="rule-list">
				<div class="rule-row rule-header" aria-hidden="true">
					<span class="rule-state"></span>
					<span class="rule-idx">#</span>
					<span class="rule-label">Rule</span>
					<span class="rule-stream">Metric</span>
					<span class="rule-cond">Condition</span>
					<span class="rule-current">Observed</span>
				</div>
				{#each displayedRules as rule, i}
					<div
						class="rule-row"
						class:rule-active={rule.status === 'active'}
						class:rule-critical={rule.status === 'active' && rule.severity === 'critical'}
						class:rule-warning={rule.status === 'active' && rule.severity === 'warning'}
						class:rule-nominal={rule.status === 'idle'}
						class:rule-waiting={rule.status === 'waiting'}
					>
						<span
							class="rule-state"
							class:state-active={rule.status === 'active'}
							class:state-waiting={rule.status === 'waiting'}
							aria-hidden="true"
						></span>
						<span class="rule-idx">{i + 1}</span>
						<span class="rule-label" title={rule.message ?? rule.label}>{rule.label ?? 'Rule'}</span>
						<span class="rule-stream" title={rule.streamId}>{formatStreamId(rule.streamId)}</span>
						<span class="rule-cond" title={`op=${rule.op} threshold=${rule.thresholdValue}`}>{conditionText(rule)}</span>
						<span class="rule-current">{observedText(rule)}</span>
					</div>
				{/each}
			</div>
		{:else}
			<div class="empty">
				<ShieldCheck size={18} />
				<span>No rules configured</span>
			</div>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.sw-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--mcs-font-sans);
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
	}

	.banner {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.65rem 0.8rem;
		background: color-mix(in srgb, var(--sw-color) 10%, var(--mcs-surface));
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 75%, transparent);
		overflow: hidden;
	}

	.icon-wrap {
		color: var(--sw-color);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.banner-text {
		display: flex;
		flex-direction: column;
		gap: 0.08rem;
		min-width: 0;
	}

	.banner-label {
		font-size: 0.92rem;
		font-weight: 650;
		color: var(--mcs-text);
	}

	.banner-detail {
		font-size: 0.74rem;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rule-list {
		flex: 1;
		overflow: auto;
		padding: 0.35rem 0;
		background: var(--mcs-bg);
	}

	.rule-row {
		display: grid;
		grid-template-columns: 0.45rem 1.25rem minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.85fr) minmax(
				0,
				0.55fr
			);
		align-items: center;
		gap: 0.5rem;
		padding: 0.48rem 0.8rem;
		font-size: 0.78rem;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
		color: var(--mcs-text-muted);
	}

	.rule-row.rule-header {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--mcs-surface);
		border-bottom: 1px solid var(--mcs-border);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: var(--mcs-text-muted);
	}

	.rule-row.rule-active {
		background: color-mix(in srgb, var(--mcs-surface-alt) 72%, transparent);
	}

	.rule-row.rule-critical {
		color: color-mix(in srgb, #fecaca 85%, var(--mcs-text-muted));
	}

	.rule-row.rule-warning {
		color: color-mix(in srgb, #fde68a 82%, var(--mcs-text-muted));
	}

	.rule-row.rule-nominal {
		color: color-mix(in srgb, #4ade80 62%, var(--mcs-text-muted));
	}

	.rule-row.rule-waiting {
		color: color-mix(in srgb, var(--mcs-text-muted) 88%, transparent);
	}

	.rule-state {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--mcs-text-muted) 55%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mcs-border) 70%, transparent);
	}

	.rule-row.rule-critical .rule-state.state-active {
		background: #ef4444;
		box-shadow: 0 0 0 4px color-mix(in srgb, #ef4444 16%, transparent);
	}

	.rule-row.rule-warning .rule-state.state-active {
		background: #d29922;
		box-shadow: 0 0 0 4px color-mix(in srgb, #d29922 16%, transparent);
	}

	.rule-row.rule-nominal .rule-state {
		background: #238636;
		box-shadow: 0 0 0 4px color-mix(in srgb, #238636 14%, transparent);
	}

	.rule-state.state-waiting {
		background: color-mix(in srgb, var(--mcs-text-muted) 30%, transparent);
	}

	.rule-idx,
	.rule-cond,
	.rule-current {
		font-family: var(--mcs-font-mono);
		font-variant-numeric: tabular-nums;
	}

	.rule-idx {
		text-align: right;
		font-size: 0.72rem;
	}

	.rule-stream,
	.rule-label,
	.rule-cond {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rule-stream {
		color: var(--mcs-text);
		font-family: var(--mcs-font-mono);
	}

	.rule-row.rule-nominal .rule-stream,
	.rule-row.rule-nominal .rule-current {
		color: color-mix(in srgb, #dcfce7 72%, var(--mcs-text));
	}

	.rule-current {
		color: var(--mcs-text);
		text-align: right;
		min-width: 5.2ch;
	}

	.rule-row:not(.rule-active) .rule-label {
		color: color-mix(in srgb, var(--mcs-text-muted) 88%, transparent);
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex: 1;
		color: var(--mcs-text-muted);
		font-size: 0.75rem;
	}
</style>
