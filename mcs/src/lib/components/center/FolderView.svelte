<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { currentProject } from '$lib/stores/project';
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { getType } from '$lib/object-types/registry.js';
	import { explorerTree } from '$lib/stores/explorerTree.js';
	import { findNodeById } from '$lib/objects';
	import type { MCSObject } from '$lib/objects/types.js';
	import { formatCompactDateTime } from '$lib/date-time-format';
	import { LayoutDashboard, FolderOpen } from '@lucide/svelte';

	let { object } = $props<{ object: MCSObject & { id: string } }>();

	// Find children from the explorer tree
	const children = $derived.by(() => {
		const tree = $explorerTree;
		if (!tree) return [];
		const node = findNodeById(tree, object.id);
		return node?.children ?? [];
	});

	function openChild(childId: string) {
		const url = new URL($page.url);
		url.searchParams.set('object', childId);
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	const effectiveOptions = $derived(
		getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime)
	);

	function formatDate(iso?: string) {
		if (!iso) return '';
		try {
			const d = new Date(iso);
			return formatCompactDateTime(d, new Date(), effectiveOptions);
		} catch {
			return '';
		}
	}
</script>

<div class="folder-view">
	<div class="folder-header">
		<FolderOpen size={18} />
		<span class="folder-name">{object.name}</span>
		<span class="folder-count">{children.length} item{children.length === 1 ? '' : 's'}</span>
	</div>

	{#if children.length === 0}
		<div class="empty-state">
			<p>This folder is empty.</p>
			<p class="hint">Drag objects here or use the + button to add new items.</p>
		</div>
	{:else}
		<div class="children-grid">
			{#each children as child (child.id)}
				{@const typeInfo = getType(child.type)}
				{@const Icon = typeInfo?.icon ?? LayoutDashboard}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					class="child-card"
					class:is-folder={child.type === 'folder'}
					role="button"
					tabindex="0"
					onclick={() => openChild(child.id)}
					onkeydown={(e) => e.key === 'Enter' && openChild(child.id)}
					draggable={true}
					ondragstart={(e) => {
						e.dataTransfer?.setData('mcs-object-id', child.id);
					}}
					title={child.name}
				>
					<div class="card-icon">
						<Icon size={22} />
					</div>
					<div class="card-body">
						<span class="card-name">{child.name}</span>
						<span class="card-type">{typeInfo?.label ?? child.type}</span>
					</div>
					{#if child.updatedAt}
						<span class="card-date">{formatDate(child.updatedAt)}</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.folder-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 1rem 1.25rem;
		overflow-y: auto;
		gap: 1rem;
		box-sizing: border-box;
	}

	.folder-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		flex-shrink: 0;
	}

	.folder-header :global(svg) {
		color: var(--mcs-accent);
		flex-shrink: 0;
	}

	.folder-name {
		font-size: 1rem;
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.folder-count {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		flex-shrink: 0;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		gap: 0.5rem;
		color: var(--mcs-text-muted);
		font-size: 0.9rem;
		text-align: center;
	}

	.empty-state p {
		margin: 0;
	}

	.hint {
		font-size: 0.8rem;
		opacity: 0.7;
	}

	.children-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
		align-content: start;
	}

	.child-card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.75rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		cursor: pointer;
		transition:
			border-color 0.12s,
			background 0.12s,
			transform 0.08s;
		user-select: none;
		min-width: 0;
		position: relative;
	}

	.child-card:hover {
		border-color: var(--mcs-accent);
		background: var(--mcs-surface-alt);
	}

	.child-card:active {
		transform: scale(0.98);
	}

	.child-card:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}

	.child-card.is-folder {
		background: var(--mcs-surface-alt);
	}

	.card-icon {
		display: flex;
		align-items: center;
		color: var(--mcs-accent);
		opacity: 0.85;
	}

	.child-card.is-folder .card-icon {
		color: var(--mcs-text-muted);
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.card-name {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--mcs-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-type {
		font-size: 0.7rem;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
	}

	.card-date {
		font-size: 0.68rem;
		color: var(--mcs-text-muted);
		opacity: 0.7;
		margin-top: 0.25rem;
	}
</style>
