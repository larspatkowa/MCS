<script lang="ts">
	import type { GridLayoutItem } from '$lib/objects/types.js';
	import {
		currentProject,
		inspectedLayoutObject,
		selectedObject,
		selectedLayoutContext,
		selectedObjectId,
		invalidateSelectedObject
	} from '$lib/stores/project';
	import { fetchProjectObject, type ProjectObject } from '$lib/objects/client-cache.js';
	import { getPropertyEditor } from '$lib/object-types/property-editors.js';
	import { getType } from '$lib/object-types/registry.js';
	import { LayoutDashboard } from '@lucide/svelte';
	import ProjectProps from './ProjectProps.svelte';
	import FolderProps from './FolderProps.svelte';
	import GridLayoutProps from './GridLayoutProps.svelte';
	import PlacementSection from './PlacementSection.svelte';
	import GenericProps from './GenericProps.svelte';
	import { propertyFilterText, propertyPanelMode } from '$lib/stores/property-panel';

	let lastSelectedId = $state<string | null>(null);

	$effect(() => {
		const id = $selectedObjectId;
		const ctx = $selectedLayoutContext;
		const obj = $selectedObject;
		if (ctx && id !== ctx.layoutObjectId) {
			selectedLayoutContext.set(null);
			return;
		}
		if (ctx && obj?.type === 'grid-layout' && ctx.layoutObjectId === obj.id) {
			const items = (obj.props?.items as GridLayoutItem[] | undefined) ?? [];
			if (!items.some((i) => i.id === ctx.itemId)) {
				selectedLayoutContext.set(null);
			}
		}
	});

	let inspectedObject = $state<ProjectObject | null>(null);
	let inspectedLoading = $state(false);

	const effectiveInspectedId = $derived.by(() => {
		// While editing placement, Properties must be anchored to the parent layout object.
		if ($selectedLayoutContext) return null;
		const ctx = $inspectedLayoutObject;
		if (!ctx) return null;
		if (ctx.layoutObjectId !== $selectedObjectId) return null;
		return ctx.objectId;
	});

	$effect(() => {
		const ctx = $inspectedLayoutObject;
		if (!ctx) return;
		if (ctx.layoutObjectId !== $selectedObjectId) {
			inspectedLayoutObject.set(null);
			inspectedObject = null;
			inspectedLoading = false;
		}
	});

	$effect(() => {
		const proj = $currentProject;
		const objectId = effectiveInspectedId;
		if (!proj || !objectId) {
			inspectedObject = null;
			inspectedLoading = false;
			return;
		}

		inspectedLoading = true;
		fetchProjectObject(proj.id, objectId, { force: true })
			.then((obj) => {
				if (effectiveInspectedId !== objectId) return;
				inspectedObject = obj;
			})
			.finally(() => {
				if (effectiveInspectedId === objectId) inspectedLoading = false;
			});
	});

	$effect(() => {
		const id = $selectedObjectId;
		if (id === lastSelectedId) return;
		lastSelectedId = id;
		propertyFilterText.set('');
	});

	const gridPlacementItem = $derived.by(() => {
		const obj = $selectedObject;
		const ctx = $selectedLayoutContext;
		if (
			!obj ||
			obj.type !== 'grid-layout' ||
			!ctx ||
			ctx.layoutType !== 'grid' ||
			ctx.layoutObjectId !== obj.id
		)
			return null;
		const items = (obj.props?.items as GridLayoutItem[] | undefined) ?? [];
		return items.find((i) => i.id === ctx.itemId) ?? null;
	});

	const propertiesTarget = $derived.by(() => {
		return effectiveInspectedId ? inspectedObject : $selectedObject;
	});
</script>

{#if !propertiesTarget}
	<div class="panel-empty">
		<p class="panel-empty-text">Select an object to edit properties.</p>
	</div>
{:else}
	{@const selected = propertiesTarget}
	{@const typeInfo = getType(selected.type)}
	{@const TypeIcon = typeInfo?.icon ?? LayoutDashboard}
	<div class="panel-header">
		<div class="panel-title-row">
			<div class="panel-title">{selected.name}</div>
			<div
				class="panel-type"
				aria-label={`Object type: ${typeInfo?.label ?? selected.type}`}
				title={`Object type: ${typeInfo?.label ?? selected.type}`}
			>
				<TypeIcon size={13} />
				<span>{typeInfo?.label ?? selected.type}</span>
			</div>
		</div>
		<div class="panel-toolbar">
			<label
				class="panel-advanced-toggle"
				title={$propertyPanelMode === 'essentials'
					? 'Showing essential fields only — check to reveal all props'
					: 'Showing all fields'}
			>
				<input
					type="checkbox"
					checked={$propertyPanelMode === 'advanced'}
					onchange={(e) =>
						propertyPanelMode.set(
							(e.target as HTMLInputElement).checked ? 'advanced' : 'essentials'
						)}
				/>
				<span>Show advanced</span>
			</label>
			<input
				type="search"
				class="panel-filter"
				placeholder="Filter fields..."
				value={$propertyFilterText}
				oninput={(e) => propertyFilterText.set((e.target as HTMLInputElement).value)}
			/>
		</div>
	</div>
	{#if inspectedLoading}
		<div class="panel-subheader">Inspecting object inside layout…</div>
	{/if}
	{#if selected.type === 'project'}
		<ProjectProps object={selected} />
	{:else if selected.type === 'folder'}
		<FolderProps object={selected} />
	{:else if selected.type === 'grid-layout'}
		{#if gridPlacementItem}
			<PlacementSection
				layoutObjectId={selected.id}
				item={gridPlacementItem}
				onUpdate={(itemId, patch) => {
					const items = ((selected.props?.items as GridLayoutItem[] | undefined) ?? []).map((i) =>
						i.id === itemId ? { ...i, ...patch } : i
					);
					const proj = $currentProject;
					if (!proj) return;
					fetch(`/api/projects/${proj.id}/objects/${selected.id}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							props: { ...selected.props, items },
							expectedUpdatedAt: selected.updatedAt
						})
					}).then((r) => {
						if (r.ok || r.status === 409) invalidateSelectedObject();
					});
				}}
			/>
		{/if}
		<GridLayoutProps
			props={selected.props}
			objectId={selected.id}
			onUpdate={(props) => {
				const proj = $currentProject;
				if (!proj) return;
				fetch(`/api/projects/${proj.id}/objects/${selected.id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ props, expectedUpdatedAt: selected.updatedAt })
				}).then((r) => {
					if (r.ok || r.status === 409) invalidateSelectedObject();
				});
			}}
		/>
	{:else}
		{@const EditorComponent = getPropertyEditor(selected.type)}
		{#if EditorComponent}
			<EditorComponent object={selected} />
		{:else}
			<GenericProps object={selected} />
		{/if}
	{/if}
{/if}

<style>
	.panel-header {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
	}
	.panel-subheader {
		padding: 0.35rem 0.75rem;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
	}
	.panel-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--mcs-text);
		line-height: 1.3;
	}
	.panel-title-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.panel-type {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
		font-family: var(--mcs-font-mono);
		font-size: 0.68rem;
		font-weight: 500;
		color: var(--mcs-text-muted);
		white-space: nowrap;
	}
	.panel-type :global(svg) {
		flex: 0 0 auto;
		color: var(--mcs-accent);
	}
	.panel-toolbar {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.35rem;
		margin-top: 0.35rem;
	}
	.panel-advanced-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		cursor: pointer;
		user-select: none;
	}
	.panel-advanced-toggle input[type='checkbox'] {
		margin: 0;
		accent-color: var(--mcs-accent);
	}
	.panel-advanced-toggle span {
		font-family: var(--mcs-font-mono);
	}
	.panel-filter {
		width: 100%;
		padding: 0.35rem 0.5rem;
		font-size: 0.8rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		font-family: var(--mcs-font-sans);
	}
	.panel-filter:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
	.panel-empty {
		padding: 0.75rem;
	}
	.panel-empty-text {
		margin: 0;
		font-size: 0.85rem;
		color: var(--mcs-text-muted);
	}
</style>
