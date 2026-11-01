<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { currentProject, selectedObject } from '$lib/stores/project';
	import { refreshExplorerTree } from '$lib/stores/explorerTree';
	import { addObjectModalOpen } from '$lib/stores/settings';
	import { canContainChildren, type ObjectType } from '$lib/objects';
	import AddObjectModal from './AddObjectModal.svelte';
	import { Plus } from '@lucide/svelte';
	let modalOpen = $state(false);
	let saving = $state(false);

	$effect(() => {
		if ($addObjectModalOpen && $currentProject) {
			modalOpen = true;
			addObjectModalOpen.set(false);
		}
	});

	function openModal() {
		modalOpen = true;
	}

	function handleSave(type: string, name: string, notes: string, props: Record<string, unknown>) {
		const proj = $currentProject;
		if (!proj) return;
		const selected = $selectedObject;
		const parentId =
			selected && canContainChildren(selected.type as ObjectType) ? selected.id : proj.id;
		saving = true;
		fetch(`/api/projects/${proj.id}/objects`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type,
				parentId,
				name,
				notes,
				props
			})
		})
			.then((r) => r.ok && r.json())
			.then((obj) => {
				if (obj) {
					modalOpen = false;
					addObjectModalOpen.set(false);
					const url = new URL($page.url);
					url.searchParams.set('object', obj.id);
					goto(url.pathname + url.search);
					refreshExplorerTree();
				}
			})
			.finally(() => {
				saving = false;
			});
	}

	function handleCancel() {
		modalOpen = false;
		addObjectModalOpen.set(false);
	}
</script>

{#if $currentProject}
	<button type="button" class="add-btn" onclick={openModal} aria-label="Add object">
		<Plus size={12} />
		<span class="add-btn-text">Add</span>
	</button>
{/if}

{#if modalOpen && $currentProject}
	<AddObjectModal onSave={handleSave} onCancel={handleCancel} {saving} />
{/if}

<style>
	:global(.add-btn) {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.4rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		font-size: 0.75rem;
		cursor: pointer;
		border-radius: var(--mcs-radius);
	}
	:global(.add-btn:hover) {
		background: var(--mcs-surface);
	}
	@container sidebar-left (max-width: 200px) {
		:global(.add-btn .add-btn-text) {
			display: none;
		}
	}
</style>
