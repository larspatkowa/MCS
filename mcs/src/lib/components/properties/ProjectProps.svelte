<script lang="ts">
	import { currentProject, invalidateSelectedObject } from '$lib/stores/project';
	import { explorerTree } from '$lib/stores/explorerTree';
	import { findNodeById } from '$lib/objects';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropText from './PropText.svelte';
	import PropTextarea from './PropTextarea.svelte';

	let { object } = $props();
	let name = $state('');
	let notes = $state('');

	const summary = $derived.by(() => {
		const tree = $explorerTree;
		if (!tree) return { directChildren: 0, descendants: 0 };
		const node = findNodeById(tree, object.id) ?? tree;
		const directChildren = node.children?.length ?? 0;
		function countDescendants(children: typeof node.children = []): number {
			return children.reduce(
				(total, child) => total + 1 + countDescendants(child.children ?? []),
				0
			);
		}
		return {
			directChildren,
			descendants: countDescendants(node.children ?? [])
		};
	});

	$effect(() => {
		name = object.name;
		notes = object.notes ?? '';
	});

	function save() {
		const proj = $currentProject;
		if (!proj) return;
		fetch(`/api/projects/${proj.id}/objects/${object.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, notes, expectedUpdatedAt: object.updatedAt })
		}).then((r) => {
			if (r.ok || r.status === 409) invalidateSelectedObject();
		});
	}
</script>

<div class="project-props">
	<PropSection title="General" id="project-general" open={true}>
		<PropRow label="Name" tooltip="Project name shown in the explorer and header.">
			<PropText
				value={name}
				onChange={(v) => {
					name = v;
					save();
				}}
			/>
		</PropRow>
		<PropRow label="Notes" tooltip="Project-level notes for operators or builders.">
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
	<PropSection title="Contents" id="project-contents" open={true}>
		<PropRow
			label="Direct children"
			tooltip="Objects and folders immediately inside the project root."
		>
			<div class="project-props-stat">{summary.directChildren}</div>
		</PropRow>
		<PropRow
			label="Total descendants"
			tooltip="All nested objects and folders below the project root."
		>
			<div class="project-props-stat">{summary.descendants}</div>
		</PropRow>
	</PropSection>
</div>

<style>
	.project-props {
		display: flex;
		flex-direction: column;
	}
	.project-props-stat {
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font-family: var(--mcs-font-mono);
		font-size: 0.82rem;
	}
</style>
