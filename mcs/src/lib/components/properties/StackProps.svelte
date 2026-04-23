<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import type { StackProps as StackPropsType } from '$lib/objects/types.js';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';

	let { props, onUpdate } = $props<{
		props: StackPropsType;
		onUpdate?: (props: StackPropsType) => void;
	}>();

	let localProps = $state<StackPropsType>({});
	let names = $state<Record<string, string>>({});

	$effect(() => {
		const p = props;
		localProps = { ...p };
	});

	$effect(() => {
		const proj = $currentProject;
		const ids = (localProps.objectIds ?? []) as string[];
		if (!proj || ids.length === 0) return;
		ids.forEach((oid) => {
			if (names[oid] !== undefined) return;
			fetch(`/api/projects/${proj.id}/objects/${oid}`)
				.then((r) => (r.ok ? r.json() : null))
				.then((o) => {
					names = {
						...names,
						[oid]: o?.name != null ? o.name : oid || '?'
					};
				})
				.catch(() => {
					names = { ...names, [oid]: oid || '?' };
				});
		});
	});

	function update(partial: Partial<StackPropsType>) {
		localProps = { ...localProps, ...partial };
		onUpdate?.(localProps);
	}

	function removeObject(oid: string) {
		const ids = ((localProps.objectIds ?? []) as string[]).filter((id) => id !== oid);
		let idx = (localProps.activeIndex as number) ?? 0;
		if (idx >= ids.length && ids.length > 0) idx = ids.length - 1;
		else if (ids.length === 0) idx = 0;
		update({ objectIds: ids, activeIndex: idx });
	}
</script>

<div class="stack-props">
	<PropSection title="Items" id="stack-items" open={true}>
		<p class="stack-props-hint">Drop objects onto the stack view to add them.</p>
		{#each localProps.objectIds ?? [] as oid (oid)}
			<div class="stack-item-row">
				<span class="stack-item-label">{names[oid] ?? (oid || '?')}</span>
				<button type="button" class="stack-item-remove" onclick={() => removeObject(oid)}
					>Remove</button
				>
			</div>
		{/each}
		{#if ((localProps.objectIds ?? []) as string[]).length === 0}
			<div class="stack-props-empty">No items</div>
		{/if}
	</PropSection>
	<PropSection title="Auto-cycle" id="stack-autocycle" advanced={true}>
		<PropRow label="Interval (seconds); 0 = off">
			<PropNumber
				value={(localProps.autoCycleSeconds as number) ?? 0}
				min={0}
				onChange={(v) => update({ autoCycleSeconds: v ?? 0 })}
			/>
		</PropRow>
	</PropSection>
</div>

<style>
	.stack-props {
		display: flex;
		flex-direction: column;
	}
	.stack-props-hint {
		margin: 0 0 0.5rem 0;
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
	}
	.stack-item-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
	}
	.stack-item-label {
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
		color: var(--mcs-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stack-item-remove {
		flex-shrink: 0;
		font-size: 0.75rem;
		padding: 0.2rem 0.4rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.stack-item-remove:hover {
		background: var(--mcs-surface-alt);
	}
	.stack-props-empty {
		font-size: 0.85rem;
		color: var(--mcs-text-muted);
	}
</style>
