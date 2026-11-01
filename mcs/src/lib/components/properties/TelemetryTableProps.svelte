<script lang="ts">
	import type {
		TelemetryTableColumn,
		TelemetryTableProps as TelemetryTablePropsType,
		MCSObject
	} from '$lib/objects/types.js';
	import { currentProject, invalidateSelectedObject } from '$lib/stores/project';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';
	import PropText from './PropText.svelte';
	import PropSelect from './PropSelect.svelte';

	let { object } = $props<{ object: MCSObject }>();

	let projectStreams = $state<{ id: string; name: string }[]>([]);
	let localProps = $state<TelemetryTablePropsType>({ rowLimit: 500, columns: [] });
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const proj = $currentProject;
		if (!proj) return;
		fetch(`/api/projects/${proj.id}/streams`)
			.then((r) => (r.ok ? r.json() : []))
			.then((list: { id: string; name?: string; metadata?: { name?: string } }[]) => {
				projectStreams = list.map((stream) => ({
					id: stream.id,
					name: stream.metadata?.name ?? stream.name ?? stream.id
				}));
			})
			.catch(() => {
				projectStreams = [];
			});
	});

	$effect(() => {
		localProps = {
			rowLimit: object.props?.rowLimit as number | undefined,
			columns: Array.isArray(object.props?.columns)
				? (object.props.columns as TelemetryTableColumn[]).map((column) => ({
						field: 'value',
						...column
					}))
				: []
		};
	});

	const streamOptions = $derived.by(() => {
		return [
			{ value: '', label: '(none)' },
			...projectStreams.map((stream) => ({ value: stream.id, label: stream.name }))
		];
	});

	function scheduleSave(nextProps: TelemetryTablePropsType) {
		localProps = nextProps;
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			const proj = $currentProject;
			if (!proj) return;
			const res = await fetch(`/api/projects/${proj.id}/objects/${object.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					props: {
						...object.props,
						rowLimit: nextProps.rowLimit ?? 500,
						columns: nextProps.columns ?? []
					},
					expectedUpdatedAt: object.updatedAt
				})
			});
			if (res.ok || res.status === 409) invalidateSelectedObject();
		}, 220);
	}

	function updateColumn(index: number, patch: Partial<TelemetryTableColumn>) {
		const nextColumns = [...(localProps.columns ?? [])];
		nextColumns[index] = { ...nextColumns[index], ...patch };
		scheduleSave({ ...localProps, columns: nextColumns });
	}

	function removeColumn(index: number) {
		const nextColumns = [...(localProps.columns ?? [])];
		nextColumns.splice(index, 1);
		scheduleSave({ ...localProps, columns: nextColumns });
	}

	function addColumn() {
		const firstStream = streamOptions.find((option) => option.value)?.value ?? '';
		const nextColumns = [
			...(localProps.columns ?? []),
			{ streamId: firstStream, field: 'value', label: 'New column' }
		];
		scheduleSave({ ...localProps, columns: nextColumns });
	}
</script>

<div class="telemetry-table-props">
	<PropSection title="General" id="telemetry-table-general" open={true}>
		<PropRow
			label="Row limit"
			tooltip="Maximum number of rows kept in the table before older rows are dropped."
		>
			<PropNumber
				value={localProps.rowLimit ?? 500}
				min={10}
				onChange={(value) => scheduleSave({ ...localProps, rowLimit: value ?? 500 })}
			/>
		</PropRow>
	</PropSection>

	<PropSection title="Columns" id="telemetry-table-columns" open={true}>
		{#each localProps.columns ?? [] as column, index (index)}
			<div class="column-row">
				<div class="column-row-header">
					<div class="column-row-title">Column {index + 1}</div>
					<button type="button" class="column-remove" onclick={() => removeColumn(index)}
						>Remove</button
					>
				</div>

				<div class="column-main-grid">
					<PropRow label="Stream" tooltip="Telemetry stream used for this column.">
						<PropSelect
							value={column.streamId}
							options={streamOptions}
							onChange={(value) => updateColumn(index, { streamId: value })}
						/>
					</PropRow>
					<PropRow
						label="Field"
						tooltip="Field inside the stream payload. Use value for simple numeric streams."
					>
						<PropText
							value={column.field ?? 'value'}
							onChange={(value) => updateColumn(index, { field: value || 'value' })}
						/>
					</PropRow>
					<PropRow label="Label" tooltip="Header text shown for this column.">
						<PropText
							value={column.label ?? ''}
							onChange={(value) => updateColumn(index, { label: value })}
						/>
					</PropRow>
				</div>
				<div class="threshold-grid">
					<PropRow label="Warn below" tooltip="Amber when the value is at or below this number.">
						<PropNumber
							value={column.warningBelow}
							onChange={(value) => updateColumn(index, { warningBelow: value })}
						/>
					</PropRow>
					<PropRow label="Alarm below" tooltip="Red when the value is at or below this number.">
						<PropNumber
							value={column.alarmBelow}
							onChange={(value) => updateColumn(index, { alarmBelow: value })}
						/>
					</PropRow>
					<PropRow label="Warn above" tooltip="Amber when the value is at or above this number.">
						<PropNumber
							value={column.warningAbove}
							onChange={(value) => updateColumn(index, { warningAbove: value })}
						/>
					</PropRow>
					<PropRow label="Alarm above" tooltip="Red when the value is at or above this number.">
						<PropNumber
							value={column.alarmAbove}
							onChange={(value) => updateColumn(index, { alarmAbove: value })}
						/>
					</PropRow>
				</div>
			</div>
		{/each}

		{#if (localProps.columns ?? []).length === 0}
			<div class="columns-empty">No columns configured yet.</div>
		{/if}

		<div class="columns-actions">
			<button type="button" class="column-add" onclick={addColumn}>Add column</button>
		</div>
	</PropSection>
</div>

<style>
	.telemetry-table-props {
		display: flex;
		flex-direction: column;
	}
	.column-row {
		display: grid;
		gap: 0.5rem;
		padding: 0.65rem 0;
		border-top: 1px solid var(--mcs-border);
	}
	.column-row:first-of-type {
		border-top: none;
		padding-top: 0;
	}
	.column-row-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.column-row-title {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--mcs-text);
	}
	.column-remove,
	.column-add {
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: transparent;
		color: var(--mcs-text);
		padding: 0.25rem 0.45rem;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.column-remove:hover,
	.column-add:hover {
		background: var(--mcs-surface-alt);
	}
	.column-main-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.threshold-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
	}
	.columns-empty {
		padding: 0.8rem 0.9rem;
		border: 1px dashed var(--mcs-border);
		border-radius: var(--mcs-radius);
		color: var(--mcs-text-muted);
		font-size: 0.82rem;
		margin-bottom: 0.75rem;
	}
	.columns-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	@media (max-width: 900px) {
		.column-main-grid,
		.threshold-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
