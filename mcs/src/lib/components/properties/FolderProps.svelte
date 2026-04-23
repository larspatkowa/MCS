<script lang="ts">
	import { currentProject, invalidateSelectedObject } from '$lib/stores/project';
	import { explorerTree } from '$lib/stores/explorerTree';
	import { findNodeById } from '$lib/objects';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropText from './PropText.svelte';
	import PropTextarea from './PropTextarea.svelte';

	let { object, creationMode = false } = $props<{
		object?: { name: string; notes?: string; id?: string; updatedAt?: string };
		creationMode?: boolean;
	}>();
	let name = $state('');
	let notes = $state('');

	const summary = $derived.by(() => {
		if (!object?.id) return { directChildren: 0, descendants: 0 };
		const tree = $explorerTree;
		if (!tree) return { directChildren: 0, descendants: 0 };
		const node = findNodeById(tree, object.id);
		const directChildren = node?.children?.length ?? 0;
		function countDescendants(
			children: Array<{ children?: Array<{ children?: unknown[] }> }> = []
		): number {
			return children.reduce(
				(total, child) =>
					total +
					1 +
					countDescendants(
						(child.children ?? []) as Array<{ children?: Array<{ children?: unknown[] }> }>
					),
				0
			);
		}
		return {
			directChildren,
			descendants: countDescendants(node?.children ?? [])
		};
	});

	$effect(() => {
		const obj = object;
		if (obj) {
			name = obj.name ?? '';
			notes = obj.notes ?? '';
		}
	});

	function save() {
		const proj = $currentProject;
		if (!proj || !object) return;
		fetch(`/api/projects/${proj.id}/objects/${object.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, notes, expectedUpdatedAt: object.updatedAt })
		}).then((r) => {
			if (r.ok || r.status === 409) invalidateSelectedObject();
		});
	}
</script>

<div class="folder-props">
	{#if !creationMode}
		<PropSection title="General" id="folder-general" open={true}>
			<PropRow label="Name" tooltip="Folder name shown in the explorer and header.">
				<PropText
					value={name}
					onChange={(v) => {
						name = v;
						save();
					}}
				/>
			</PropRow>
			<PropRow label="Notes" tooltip="Folder notes for grouping or handoff context.">
				<PropTextarea
					value={notes}
					rows={3}
					onChange={(v) => {
						notes = v;
						save();
					}}
				/>
			</PropRow>
		</PropSection>
		<PropSection title="Contents" id="folder-contents" open={true}>
			<PropRow
				label="Direct children"
				tooltip="Objects and folders immediately inside this folder."
			>
				<div class="folder-props-stat">{summary.directChildren}</div>
			</PropRow>
			<PropRow
				label="Total descendants"
				tooltip="All nested objects and folders below this folder."
			>
				<div class="folder-props-stat">{summary.descendants}</div>
			</PropRow>
		</PropSection>
	{:else}
		<p class="folder-creation-hint">No additional options. Name and notes are set above.</p>
	{/if}
</div>

<style>
	.folder-props {
		display: flex;
		flex-direction: column;
	}
	.folder-creation-hint {
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
		margin: 0;
	}
	.folder-props-stat {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font-family: var(--mcs-font-mono);
		font-size: 0.82rem;
	}
</style>
