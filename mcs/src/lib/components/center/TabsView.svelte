<script lang="ts">
	import type { TabsProps } from '$lib/objects/types.js';
	import { getType } from '$lib/object-types/registry.js';
	import LazyView from './LazyView.svelte';
	import { useChildObjects } from './ChildViews.svelte.js';

	let { objectId } = $props<{ objectId: string; props: TabsProps }>();

	const childObjects = useChildObjects(() => objectId);
	const children = $derived(childObjects.children);

	const storageKey = $derived(`mcs-tabs-${objectId}`);
	let selectedId = $state<string | null>(null);
	$effect(() => {
		try {
			selectedId = localStorage.getItem(storageKey);
		} catch {
			selectedId = null;
		}
	});
	const active = $derived(children.find((child) => child.id === selectedId) ?? children[0]);

	function select(id: string) {
		selectedId = id;
		try {
			localStorage.setItem(storageKey, id);
		} catch {
			// The tab still switches for this page load.
		}
	}

	function onKeydown(event: KeyboardEvent, index: number) {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step || children.length === 0) return;
		event.preventDefault();
		const next = children[(index + step + children.length) % children.length];
		select(next.id);
		document.getElementById(`tab-${objectId}-${next.id}`)?.focus();
	}
</script>

<div class="tabs-root">
	{#if children.length === 0}
		<p class="empty">Add objects to this Tabs view in the tree. Each child becomes a tab.</p>
	{:else}
		<div class="tab-bar" role="tablist" aria-label="Views">
			{#each children as child, index (child.id)}
				{@const Icon = getType(child.type)?.icon}
				<button
					type="button"
					role="tab"
					id="tab-{objectId}-{child.id}"
					aria-selected={child.id === active?.id}
					aria-controls="panel-{objectId}"
					tabindex={child.id === active?.id ? 0 : -1}
					onclick={() => select(child.id)}
					onkeydown={(event) => onKeydown(event, index)}
				>
					{#if Icon}<Icon size={13} />{/if}
					{child.name}
				</button>
			{/each}
		</div>
		<div
			class="panel"
			role="tabpanel"
			id="panel-{objectId}"
			aria-labelledby={active ? `tab-${objectId}-${active.id}` : undefined}
		>
			{#if active}
				{#key active.id}
					<LazyView typeId={active.type} objectId={active.id} props={active.props ?? {}} />
				{/key}
			{/if}
		</div>
	{/if}
</div>

<style>
	.tabs-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: var(--mcs-font-sans);
	}
	.tab-bar {
		display: flex;
		gap: 2px;
		padding: 0 6px;
		border-bottom: 1px solid var(--mcs-border);
		overflow-x: auto;
		flex-shrink: 0;
	}
	[role='tab'] {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px 6px;
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--mcs-text-muted);
		font: inherit;
		font-size: 12px;
		white-space: nowrap;
		cursor: pointer;
	}
	[role='tab']:hover {
		color: var(--mcs-text);
	}
	[role='tab'][aria-selected='true'] {
		color: var(--mcs-text);
		border-bottom-color: var(--mcs-accent);
	}
	[role='tab']:focus-visible {
		outline: 2px solid var(--mcs-focus-ring, var(--mcs-accent));
		outline-offset: -2px;
	}
	.panel {
		flex: 1;
		min-height: 0;
		position: relative;
	}
	.empty {
		margin: 0;
		padding: 2rem 1rem;
		color: var(--mcs-text-muted);
		font-size: 12px;
		text-align: center;
	}
</style>
