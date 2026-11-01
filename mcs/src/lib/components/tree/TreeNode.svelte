<script lang="ts">
	import { selectedObjectId } from '$lib/stores/project';
	import { isDraggingObject, dragParentId } from '$lib/stores/drag.js';
	import { getType } from '$lib/object-types/registry.js';
	import type { ObjectTreeNode } from '$lib/objects';
	import TreeNodeRecursive from './TreeNode.svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { LayoutDashboard, ChevronRight, ChevronDown } from '@lucide/svelte';

	let {
		node,
		expandedIds,
		toggleExpand,
		select,
		onDelete,
		onReorder,
		parentId
	}: {
		node: ObjectTreeNode;
		expandedIds: Set<string>;
		toggleExpand: (id: string) => void;
		select: (node: ObjectTreeNode) => void;
		onDelete?: (node: ObjectTreeNode) => void;
		onReorder?: (draggedId: string, parentId: string, insertBeforeId: string | null) => void;
		parentId?: string;
	} = $props();

	const typeInfo = $derived(node ? getType(node.type) : undefined);
	const IconComponent = $derived(typeInfo?.icon ?? LayoutDashboard);

	const showReorderZones = $derived($isDraggingObject && parentId != null && onReorder != null);

	function handleClick() {
		select(node);
	}

	function handleReorderDrop(e: DragEvent, insertBeforeId: string | null) {
		e.preventDefault();
		e.stopPropagation();
		const draggedId = e.dataTransfer?.getData('mcs-object-id');
		// Drops within this node's expanded children list → parent is node.id
		if (draggedId && node?.id && onReorder) onReorder(draggedId, node.id, insertBeforeId);
		dragParentId.set(null);
	}
</script>

{#if node}
	{@const hasChildren = node.children && node.children.length > 0}
	{@const isExpanded = expandedIds.has(node.id)}
	<ContextMenu.Root>
		<ContextMenu.Trigger
			class="tree-node {$selectedObjectId === node.id ? 'selected' : ''}"
			role="button"
			tabindex={0}
			draggable={node.type !== 'project'}
			ondragstart={(e) => {
				if (node.type !== 'project') {
					e.dataTransfer?.setData('mcs-object-id', node.id);
					e.dataTransfer?.setData('mcs-drag-parent-id', parentId ?? '');
					isDraggingObject.set(true);
					dragParentId.set(parentId ?? null);
				}
			}}
			ondragend={() => {
				isDraggingObject.set(false);
				dragParentId.set(null);
			}}
			onclick={handleClick}
			onkeydown={(e) => e.key === 'Enter' && select(node)}
		>
			<span
				class="expand"
				aria-hidden="true"
				title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : ''}
				onclick={(e) => {
					e.stopPropagation();
					if (hasChildren) toggleExpand(node.id);
				}}
			>
				{#if hasChildren}
					{#if isExpanded}
						<ChevronDown size={14} />
					{:else}
						<ChevronRight size={14} />
					{/if}
				{:else}
					<span class="expand-placeholder"></span>
				{/if}
			</span>
			<span class="icon" aria-hidden="true">
				<IconComponent size={16} />
			</span>
			<span class="label">{node.name}</span>
		</ContextMenu.Trigger>
		<ContextMenu.Content class="min-w-[10rem]">
			<ContextMenu.Item
				onSelect={() => {
					select(node);
				}}>Open</ContextMenu.Item
			>
			<ContextMenu.Separator />
			{#if node.type !== 'project'}
				<ContextMenu.Item
					onSelect={() => {
						onDelete?.(node);
					}}
				>
					Delete
				</ContextMenu.Item>
			{/if}
		</ContextMenu.Content>
	</ContextMenu.Root>
	{#if hasChildren && isExpanded}
		<div class="children">
			{#each node.children as child (child.id)}
				{#if showReorderZones}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
					<div
						class="reorder-drop-zone"
						role="button"
						tabindex="-1"
						aria-label="Drop to reorder before {child.name}"
						ondragover={(e) => {
							if (e.dataTransfer?.types?.includes('mcs-object-id')) {
								e.preventDefault();
								e.dataTransfer.dropEffect = 'move';
							}
						}}
						ondrop={(e) => handleReorderDrop(e, child.id)}
					></div>
				{/if}
				<TreeNodeRecursive
					node={child}
					{expandedIds}
					{toggleExpand}
					{select}
					{onDelete}
					{onReorder}
					parentId={node.id}
				/>
			{/each}
			{#if showReorderZones}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="reorder-drop-zone reorder-drop-zone-last"
					role="button"
					tabindex="0"
					aria-label="Drop to reorder at end"
					ondragover={(e) => {
						if (e.dataTransfer?.types?.includes('mcs-object-id')) {
							e.preventDefault();
							e.dataTransfer.dropEffect = 'move';
						}
					}}
					ondrop={(e) => handleReorderDrop(e, null)}
				></div>
			{/if}
		</div>
	{/if}
{/if}

<style>
	:global(.tree-node) {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.75rem;
		cursor: pointer;
		font-size: 0.85rem;
	}
	:global(.tree-node:hover) {
		background: var(--mcs-surface-alt);
	}
	:global(.tree-node.selected) {
		background: var(--mcs-surface-alt);
	}
	.expand {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		color: var(--mcs-text-muted);
	}
	.expand-placeholder {
		display: inline-block;
		width: 1ch;
	}
	.icon {
		display: flex;
		align-items: center;
		color: var(--mcs-text-muted);
	}
	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.children {
		margin-left: 1rem;
		border-left: 1px solid var(--mcs-border);
	}
	.reorder-drop-zone {
		min-height: 4px;
		margin: 0 0.75rem;
		border-radius: 2px;
		background: transparent;
	}
	.reorder-drop-zone:global(.drag-over),
	.reorder-drop-zone:hover {
		background: var(--mcs-accent);
		opacity: 0.4;
	}
	.reorder-drop-zone-last {
		min-height: 8px;
	}
</style>
