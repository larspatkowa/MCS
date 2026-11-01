<script lang="ts">
	import type { MCSObject } from '$lib/objects/types.js';
	import { currentProject, invalidateSelectedObject } from '$lib/stores/project';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';
	import PropText from './PropText.svelte';
	import PropTextarea from './PropTextarea.svelte';
	import PropSelect from './PropSelect.svelte';
	import PropCheckbox from './PropCheckbox.svelte';
	import PropColor from './PropColor.svelte';
	import PropMultiStream from './PropMultiStream.svelte';

	let { object }: { object: MCSObject } = $props();

	let projectStreams = $state<{ id: string; name: string; fields: string[] }[]>([]);

	$effect(() => {
		const project = $currentProject;
		if (!project) return;
		const controller = new AbortController();
		fetch(`/api/projects/${project.id}/streams`, { signal: controller.signal })
			.then((response) => (response.ok ? response.json() : []))
			.then(
				(
					list: {
						id: string;
						name?: string;
						metadata?: { name?: string; units?: unknown };
					}[]
				) => {
					projectStreams = list.map((stream) => ({
						id: stream.id,
						name: stream.metadata?.name ?? stream.name ?? stream.id,
						// A per-field unit map also declares the stream's fields.
						fields:
							stream.metadata?.units && typeof stream.metadata.units === 'object'
								? Object.keys(stream.metadata.units)
								: []
					}));
				}
			)
			.catch(() => {
				if (!controller.signal.aborted) projectStreams = [];
			});
		return () => controller.abort();
	});

	const streamOptions = $derived([
		{ value: '', label: '(none)' },
		...projectStreams.map((stream) => ({ value: stream.id, label: stream.name }))
	]);
	// Plots can draw one field of a multi-field stream as `stream#field`.
	const seriesOptions = $derived(
		projectStreams.flatMap((stream) => [
			{ value: stream.id, label: stream.name },
			...stream.fields.map((field) => ({
				value: `${stream.id}#${field}`,
				label: `${stream.name} · ${field}`
			}))
		])
	);

	const LABELS: Record<string, string> = {
		dataSource: 'Data source',
		dataSources: 'Data sources',
		streamId: 'Stream ID',
		min: 'Minimum',
		max: 'Maximum',
		unit: 'Unit',
		label: 'Label',
		showLabel: 'Show label',
		precision: 'Decimal places',
		displayType: 'Display type',
		showGrid: 'Show grid',
		pollInterval: 'Fallback refresh (ms)',
		interpolation: 'Interpolation',
		windowSec: 'Window (s)',
		showRangeLabels: 'Show range labels',
		trackOpacity: 'Track opacity',
		thresholdOpacity: 'Threshold opacity',
		thresholdMin: 'Low alarm',
		thresholdMax: 'High alarm',
		warningMin: 'Low warning',
		warningMax: 'High warning',
		normalColor: 'Normal color',
		warningColor: 'Warning color',
		alarmColor: 'Alarm color',
		arcColor: 'Arc color',
		needleColor: 'Needle color',
		thresholdColor: 'Threshold color',
		trackColor: 'Track color',
		tickStep: 'Tick step',
		tickCount: 'Tick count',
		tickLabelPrecision: 'Tick decimal places',
		content: 'Content',
		fields: 'Fields',
		staleAfterSec: 'Stale after (s)',
		showControls: 'Show count controls',
		lookbackHours: 'Look back (hours)',
		showNotes: 'Show operator notes',
		latField: 'Latitude field',
		lonField: 'Longitude field',
		altField: 'Altitude field',
		padLat: 'Pad latitude',
		padLon: 'Pad longitude',
		xSource: 'X stream',
		xField: 'X field',
		ySource: 'Y stream',
		yField: 'Y field',
		xLabel: 'X axis title',
		yLabel: 'Y axis title',
		connect: 'Connect points',
		minRowHeight: 'Minimum row height (px)',
		showTitles: 'Show titles',
		url: 'Address'
	};

	const DESCRIPTIONS: Record<string, string> = {
		dataSource: 'Stream that supplies the displayed value.',
		dataSources: 'Streams rendered together in the plot.',
		streamId: 'Stream used by this display.',
		min: 'Lower bound for the display scale.',
		max: 'Upper bound for the display scale.',
		unit: 'Suffix shown beside the value.',
		precision: 'Number of decimal places.',
		showGrid: 'Show the plot background grid.',
		pollInterval:
			'How often this display checks for new samples if live events are unavailable. Default: 1,000 ms; range: 100–60,000 ms. This does not change the source sample rate.',
		interpolation: 'How adjacent samples are connected.',
		windowSec: 'Live plot window in seconds.',
		rowLimit: 'Maximum rows kept in the table.',
		content: 'Markdown content saved in this note.',
		fields: 'Comma-separated payload fields to list. Leave empty to list every field.',
		staleAfterSec: 'Rows with no new sample for this long are marked stale.',
		lookbackHours: 'How far back alarms and notes are listed.',
		padLat: 'Launch site latitude in decimal degrees. Empty uses the first GPS fix.',
		padLon: 'Launch site longitude in decimal degrees. Empty uses the first GPS fix.',
		ySource: 'Leave empty to read the Y field from the X stream.',
		minRowHeight: 'Rows grow to fill the view and scroll below this height.',
		url: 'An http or https page shown in a sandbox without access to MCS.'
	};

	// Optional numbers start empty, so they cannot be inferred from the stored value.
	const OPTIONAL_NUMBER_KEYS = new Set(['padLat', 'padLon']);
	// Written by the view itself, not edited by hand.
	const VIEW_STATE_KEYS = new Set(['t0', 'heldSeconds']);

	const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
		displayType: [
			{ value: 'linear', label: 'Linear bar' },
			{ value: 'dial', label: 'Dial' }
		],
		interpolation: [
			{ value: 'linear', label: 'Linear' },
			{ value: 'step', label: 'Step' },
			{ value: 'smooth', label: 'Smooth' }
		]
	};

	const ESSENTIAL_KEYS: Record<string, string[]> = {
		gauge: [
			'dataSource',
			'pollInterval',
			'min',
			'max',
			'unit',
			'label',
			'displayType',
			'precision'
		],
		'line-plot': ['dataSources', 'interpolation', 'showGrid', 'pollInterval'],
		'markdown-note': ['content']
	};

	function isStreamField(key: string): boolean {
		return key === 'dataSource' || key === 'streamId' || key === 'xSource' || key === 'ySource';
	}

	function isColorField(key: string): boolean {
		return key.toLowerCase().includes('color');
	}

	function getEditorType(
		key: string,
		value: unknown
	):
		| 'select'
		| 'stream'
		| 'multisource'
		| 'color'
		| 'boolean'
		| 'number'
		| 'textarea'
		| 'text'
		| 'skip' {
		if (VIEW_STATE_KEYS.has(key)) return 'skip';
		if (OPTIONAL_NUMBER_KEYS.has(key)) return 'number';
		if (key === 'dataSources') return 'multisource';
		if (key === 'content' || (typeof value === 'string' && value.length > 120)) return 'textarea';
		if (SELECT_OPTIONS[key]) return 'select';
		if (isStreamField(key)) return 'stream';
		if (isColorField(key)) return 'color';
		if (typeof value === 'boolean') return 'boolean';
		if (typeof value === 'number') return 'number';
		if (typeof value === 'string') return 'text';
		// Arrays and nested objects belong to their dedicated editors. Do not
		// expose a text field that could silently corrupt their shape.
		return 'skip';
	}

	function getLabel(key: string): string {
		return (
			LABELS[key] ??
			key
				.replace(/([A-Z])/g, ' $1')
				.replace(/[_-]/g, ' ')
				.replace(/^\w/, (character) => character.toUpperCase())
				.trim()
		);
	}

	function getDescription(key: string, label: string, editorType: string): string {
		if (DESCRIPTIONS[key]) return DESCRIPTIONS[key];
		if (editorType === 'boolean') return `Turn ${label.toLowerCase()} on or off.`;
		if (editorType === 'color') return `Choose the ${label.toLowerCase()}.`;
		return `Set ${label.toLowerCase()}.`;
	}

	function isEssential(key: string): boolean {
		const essentials = ESSENTIAL_KEYS[object.type];
		return essentials ? essentials.includes(key) : true;
	}

	const propEntries = $derived.by(() =>
		Object.entries(object.props ?? {})
			.map(([key, value]) => {
				const editorType = getEditorType(key, value);
				return {
					key,
					value,
					label: getLabel(key),
					editorType,
					advanced: !isEssential(key),
					tooltip: getDescription(key, getLabel(key), editorType)
				};
			})
			.filter((entry) => entry.editorType !== 'skip')
	);

	async function updateProp(key: string, value: unknown): Promise<void> {
		const project = $currentProject;
		if (!project) return;
		const response = await fetch(`/api/projects/${project.id}/objects/${object.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				props: { ...object.props, [key]: value },
				expectedUpdatedAt: object.updatedAt
			})
		});
		if (response.ok || response.status === 409) invalidateSelectedObject();
	}
</script>

<PropSection title="Properties" id="generic-props" open={true} persistKey="mcs-props-section">
	{#each propEntries as entry (entry.key)}
		<PropRow label={entry.label} tooltip={entry.tooltip} advanced={entry.advanced}>
			{#if entry.editorType === 'select'}
				<PropSelect
					value={String(entry.value ?? '')}
					options={SELECT_OPTIONS[entry.key] ?? []}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{:else if entry.editorType === 'multisource'}
				<PropMultiStream
					values={Array.isArray(entry.value) ? (entry.value as string[]) : []}
					options={object.type === 'line-plot' ? seriesOptions : streamOptions.slice(1)}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{:else if entry.editorType === 'stream'}
				<PropSelect
					value={String(entry.value ?? '')}
					options={streamOptions}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{:else if entry.editorType === 'color'}
				<PropColor
					value={String(entry.value ?? '#666666')}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{:else if entry.editorType === 'boolean'}
				<PropCheckbox
					checked={Boolean(entry.value)}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{:else if entry.editorType === 'number'}
				<PropNumber
					value={entry.value as number | undefined}
					onChange={(value) =>
						updateProp(entry.key, value ?? (OPTIONAL_NUMBER_KEYS.has(entry.key) ? null : 0))}
				/>
			{:else if entry.editorType === 'textarea'}
				<PropTextarea
					value={String(entry.value ?? '')}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{:else}
				<PropText
					value={String(entry.value ?? '')}
					onChange={(value) => updateProp(entry.key, value)}
				/>
			{/if}
		</PropRow>
	{/each}
	{#if propEntries.length === 0}
		<p class="no-props">No configurable properties.</p>
	{/if}
</PropSection>

<style>
	.no-props {
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
		margin: 0;
	}
</style>
