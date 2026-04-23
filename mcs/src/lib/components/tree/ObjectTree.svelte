<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		currentProject,
		selectedObjectId,
		selectedObject,
		selectedLayoutContext,
		invalidateSelectedObject
	} from '$lib/stores/project';
	import { explorerTree, explorerTreeRefresh } from '$lib/stores/explorerTree';
	import { clearProjectObjectCache, primeObjectCacheFromTree } from '$lib/objects/client-cache.js';
	import TreeNode from './TreeNode.svelte';
	import { AlertCircle } from '@lucide/svelte';
	import { findParentById, findNodeById, type ObjectTreeNode } from '$lib/objects';

	let tree = $state<ObjectTreeNode | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expandedIds = $state<Set<string>>(new Set());
	let treeVersion = $state(0);
	let lastProjectId = $state<string | null>(null);

	// ── Folder state persistence ──────────────────────────────────────────────
	function storageKey(projId: string) {
		return `mcs-expanded:${projId}`;
	}

	function loadExpanded(projId: string): Set<string> {
		try {
			const raw = localStorage.getItem(storageKey(projId));
			if (raw) return new Set(JSON.parse(raw) as string[]);
		} catch {
			/* ignore */
		}
		return new Set();
	}

	function saveExpanded(projId: string, ids: Set<string>) {
		try {
			localStorage.setItem(storageKey(projId), JSON.stringify([...ids]));
		} catch {
			/* ignore */
		}
	}

	function collectExpandableIds(node: ObjectTreeNode | null): Set<string> {
		const ids = new Set<string>();
		if (!node) return ids;
		const stack: ObjectTreeNode[] = [node];
		while (stack.length) {
			const cur = stack.pop()!;
			if (cur.children && cur.children.length > 0) {
				ids.add(cur.id);
				for (const child of cur.children) stack.push(child);
			}
		}
		return ids;
	}

	function loadTree() {
		const proj = $currentProject;
		if (!proj) return;
		loading = true;
		error = null;

		fetch(`/api/projects/${proj.id}/objects`)
			.then((r) =>
				r
					.json()
					.then((data) =>
						r.ok ? data : Promise.reject(new Error(data?.error ?? 'Failed to load'))
					)
			)
			.then((data) => {
				tree = data;
				// Restore expanded state from localStorage on load (always)
				const saved = loadExpanded(proj.id);
				if (saved.size > 0) {
					expandedIds = saved;
				} else if (expandedIds.size === 0) {
					// Default: expand everything (full explorer tree)
					expandedIds = collectExpandableIds(data);
					saveExpanded(proj.id, expandedIds);
				}
				explorerTree.set(data);
				primeObjectCacheFromTree(proj.id, data);
			})
			.catch((e) => {
				error = e.message ?? 'Failed to load';
				explorerTree.set(null);
			})
			.finally(() => (loading = false));
	}

	// React to project changes — reset expansion only when project changes
	$effect(() => {
		const proj = $currentProject;
		if (!proj) {
			tree = null;
			loading = false;
			expandedIds = new Set();
			lastProjectId = null;
			explorerTree.set(null);
			clearProjectObjectCache();
			return;
		}
		if (proj.id !== lastProjectId) {
			lastProjectId = proj.id;
			expandedIds = new Set(); // only reset when switching projects
		}
		loadTree();
	});

	// React to treeVersion changes (delete, reorder) — reload tree but keep expand state
	$effect(() => {
		const _v = treeVersion;
		if (_v === 0) return;
		if (!$currentProject) return;
		loadTree();
	});

	$effect(() => {
		const v = $explorerTreeRefresh;
		if (v === 0) return;
		if (!$currentProject) return;
		loadTree();
	});

	function toggleExpand(id: string) {
		expandedIds = new Set(expandedIds);
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
		const proj = $currentProject;
		if (proj) saveExpanded(proj.id, expandedIds);
	}

	function select(obj: ObjectTreeNode) {
		const proj = $currentProject;
		if (!proj) return;
		selectedLayoutContext.set(null);

		if (obj.type !== 'project') {
			// Optimistic selection keeps center/properties reactive even if navigation is delayed.
			selectedObjectId.set(obj.id);
			selectedObject.set({
				id: obj.id,
				type: obj.type,
				name: obj.name,
				notes: obj.notes,
				createdAt: obj.createdAt,
				updatedAt: obj.updatedAt,
				props: obj.props
			});
			invalidateSelectedObject();
		}

		if (obj.type === 'project') {
			selectedObjectId.set(null);
			selectedObject.set(null);
			goto(`/project/${proj.id}`);
		} else {
			const url = new URL($page.url);
			url.searchParams.set('object', obj.id);
			goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
		}

		if (obj.children?.length) {
			expandedIds = new Set(expandedIds);
			expandedIds.add(obj.id);
			if (proj) saveExpanded(proj.id, expandedIds);
		}
	}

	async function handleDelete(node: ObjectTreeNode) {
		const proj = $currentProject;
		if (!proj || node.type === 'project') return;
		if (false) return;
		const res = await fetch(`/api/projects/${proj.id}/objects/${node.id}`, { method: 'DELETE' });
		if (!res.ok) return;
		if ($selectedObjectId === node.id) {
			goto(`/project/${proj.id}`);
		}
		// Keep parent expanded after deletion so the folder stays open
		treeVersion++;
	}

	async function handleReorder(draggedId: string, parentId: string, insertBeforeId: string | null) {
		const proj = $currentProject;
		if (!proj || !tree) return;
		if (false) return;
		const parent = findNodeById(tree, parentId);
		if (!parent?.children?.length) return;
		const siblingIds = parent.children.map((c) => c.id);

		// If the dragged item isn't a child of this parent, reparent it
		if (!siblingIds.includes(draggedId)) {
			const res = await fetch(`/api/projects/${proj.id}/object-reparent`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ objectId: draggedId, newParentId: parentId, insertBeforeId })
			});
			if (res.ok) treeVersion++;
			return;
		}

		const without = siblingIds.filter((id) => id !== draggedId);
		const insertIndex = insertBeforeId ? without.indexOf(insertBeforeId) : without.length;
		if (insertIndex < 0) return;
		const newOrder = [...without.slice(0, insertIndex), draggedId, ...without.slice(insertIndex)];
		const res = await fetch(`/api/projects/${proj.id}/object-reorder`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parentId, childIds: newOrder })
		});
		if (res.ok) treeVersion++;
	}
</script>

{#if !$currentProject}
	<p class="muted">Open a project to see objects.</p>
{:else if loading}
	<p class="muted">Loading...</p>
{:else if error}
	<div class="error-block">
		<AlertCircle size={16} />
		<p class="error-text">{error}</p>
		<button
			type="button"
			class="retry"
			onclick={() => {
				error = null;
				loadTree();
			}}>Retry</button
		>
	</div>
{:else if tree}
	<div class="tree">
		<TreeNode
			node={tree}
			{expandedIds}
			{toggleExpand}
			{select}
			onDelete={handleDelete}
			onReorder={handleReorder}
		/>
	</div>
{:else}
	<p class="muted">No objects.</p>
{/if}

<style>
	.muted {
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		color: var(--mcs-text-muted);
	}
	.error-block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.5rem 0.75rem;
		padding: 0.75rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		font-size: 0.85rem;
	}
	.error-block :global(svg) {
		color: var(--mcs-accent);
	}
	.error-text {
		margin: 0;
		color: var(--mcs-text);
		line-height: 1.35;
	}
	.error-block .retry {
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.tree {
		padding: 0.25rem 0;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
