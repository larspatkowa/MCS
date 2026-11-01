<script lang="ts">
	import { get } from 'svelte/store';
	import {
		currentProject,
		invalidateSelectedObject,
		selectedObject,
		selectedLayoutContext,
		gridLayoutEditMode,
		inspectedLayoutObject
	} from '$lib/stores/project';
	import { isDraggingObject } from '$lib/stores/drag.js';
	import { sidebarRightVisible } from '$lib/stores/sidebars';
	import { renderContext } from '$lib/stores/render-context.js';
	import type { GridLayoutProps, GridLayoutItem } from '$lib/objects/types.js';
	function uuid() {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
	import GridLayoutItemComponent from './GridLayoutItem.svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';

	let { objectId, props } = $props<{
		objectId: string;
		props: GridLayoutProps;
	}>();

	let layoutProps = $state<GridLayoutProps>({});
	let patchTimeout: ReturnType<typeof setTimeout> | null = null;
	let fitContainer: HTMLDivElement | null = null;
	let containerWidth = $state(0);
	let containerHeight = $state(0);
	let isGridDropActive = $state(false);
	let gridDragDepth = 0;

	const gridSize = $derived((layoutProps.gridSize ?? [10, 10]) as [number, number]);
	const items = $derived(layoutProps.items ?? []);
	const dimensions = $derived(layoutProps.dimensions);

	const DEFAULT_CANVAS_W = 800;
	const DEFAULT_CANVAS_H = 600;

	const scaleToFit = $derived(layoutProps.scaleToFit ?? false);
	const backgroundMode = $derived(layoutProps.backgroundMode ?? 'theme');
	const backgroundColor = $derived(layoutProps.backgroundColor ?? '#202020');
	const showGrid = $derived(
		layoutProps.showGrid !== false && (!$renderContext.active || $renderContext.showChrome)
	);
	const showChrome = $derived(
		layoutProps.showChrome !== false && (!$renderContext.active || $renderContext.showChrome)
	);
	const canvasBackground = $derived(
		backgroundMode === 'transparent' || ($renderContext.active && $renderContext.transparent)
			? 'transparent'
			: backgroundMode === 'solid'
				? backgroundColor
				: $renderContext.active
					? $renderContext.background
					: 'var(--mcs-surface-alt)'
	);

	const hasExplicitDimensions = $derived(
		(dimensions as [number, number] | undefined)?.[0] != null &&
			(dimensions as [number, number] | undefined)?.[1] != null
	);

	const effectiveDimensions = $derived.by((): [number, number] => {
		const dims = dimensions as [number, number] | undefined;
		if (dims?.[0] && dims?.[1]) return [dims[0], dims[1]];
		const w = containerWidth || DEFAULT_CANVAS_W;
		const h = containerHeight || DEFAULT_CANVAS_H;
		return [Math.max(1, w), Math.max(1, h)];
	});

	const scale = $derived.by(() => {
		if (!scaleToFit || !hasExplicitDimensions || containerWidth <= 0 || containerHeight <= 0)
			return 1;
		const [w, h] = effectiveDimensions;
		return Math.min(1, containerWidth / w, containerHeight / h);
	});

	$effect(() => {
		const el = fitContainer;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			const r = entries[0]?.contentRect;
			if (r) {
				containerWidth = r.width;
				containerHeight = r.height;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		layoutProps = props ?? {};
	});

	$effect(() => {
		if ($isDraggingObject) return;
		gridDragDepth = 0;
		isGridDropActive = false;
	});

	function schedulePatch() {
		if (patchTimeout) clearTimeout(patchTimeout);
		patchTimeout = setTimeout(() => {
			patchTimeout = null;
			const proj = $currentProject;
			if (!proj) return;
			const sel = get(selectedObject);
			const body: { props: GridLayoutProps; expectedUpdatedAt?: string } = { props: layoutProps };
			if (sel && sel.id === objectId) body.expectedUpdatedAt = sel.updatedAt;
			fetch(`/api/projects/${proj.id}/objects/${objectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			}).then((r) => {
				if (r.ok || r.status === 409) invalidateSelectedObject();
			});
		}, 300);
	}

	function handleMove(itemId: string, x: number, y: number) {
		const updatedItems = items.map((item) => (item.id === itemId ? { ...item, x, y } : item));
		layoutProps = { ...layoutProps, items: updatedItems };
		schedulePatch();
	}

	function handleResize(itemId: string, x: number, y: number, width: number, height: number) {
		const updatedItems = items.map((item) =>
			item.id === itemId ? { ...item, x, y, width, height } : item
		);
		layoutProps = { ...layoutProps, items: updatedItems };
		schedulePatch();
	}

	function handleRemoveFromLayout(itemId: string) {
		const updatedItems = items.filter((item) => item.id !== itemId);
		layoutProps = { ...layoutProps, items: updatedItems };
		schedulePatch();
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		gridDragDepth = 0;
		isGridDropActive = false;
		const objectId = e.dataTransfer?.getData('mcs-object-id');
		if (!objectId) return;

		// Allow drop even when not in edit mode: enable edit mode and add item
		if (!$gridLayoutEditMode) {
			gridLayoutEditMode.set(true);
		}

		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const layoutX = (e.clientX - rect.left) / scale;
		const layoutY = (e.clientY - rect.top) / scale;
		const width = Math.max(1, Math.floor(200 / gridSize[0]));
		const height = Math.max(1, Math.floor(150 / gridSize[1]));
		const gridCols = Math.max(1, Math.floor(effectiveDimensions[0] / gridSize[0]));
		const gridRows = Math.max(1, Math.floor(effectiveDimensions[1] / gridSize[1]));
		const rawX = Math.floor(layoutX / gridSize[0]);
		const rawY = Math.floor(layoutY / gridSize[1]);
		const preferredX = Math.max(0, Math.min(rawX, gridCols - width));
		const preferredY = Math.max(0, Math.min(rawY, gridRows - height));
		const { x, y } = findDropSlot(preferredX, preferredY, width, height, gridCols, gridRows);

		const newItem: GridLayoutItem = {
			id: uuid(),
			objectId,
			x,
			y,
			width,
			height
		};

		layoutProps = { ...layoutProps, items: [...items, newItem] };
		schedulePatch();
	}

	function isObjectTreeDrag(e: DragEvent): boolean {
		return e.dataTransfer?.types?.includes('mcs-object-id') ?? false;
	}

	function handleDragEnter(e: DragEvent) {
		if (!isObjectTreeDrag(e)) return;
		e.preventDefault();
		gridDragDepth += 1;
		isGridDropActive = true;
	}

	function handleDragOver(e: DragEvent) {
		if (!isObjectTreeDrag(e)) return;
		e.preventDefault();
		isGridDropActive = true;
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(e: DragEvent) {
		if (!isObjectTreeDrag(e)) return;
		e.preventDefault();
		gridDragDepth = Math.max(0, gridDragDepth - 1);
		if (gridDragDepth === 0) {
			isGridDropActive = false;
		}
	}

	function overlapsExistingItem(
		candidate: Pick<GridLayoutItem, 'x' | 'y' | 'width' | 'height'>
	): boolean {
		return items.some((item) => {
			const horizontalOverlap =
				candidate.x < item.x + item.width && candidate.x + candidate.width > item.x;
			const verticalOverlap =
				candidate.y < item.y + item.height && candidate.y + candidate.height > item.y;
			return horizontalOverlap && verticalOverlap;
		});
	}

	function buildSearchOrder(preferred: number, max: number): number[] {
		if (max <= 0) return [0];
		const order: number[] = [];
		for (let value = preferred; value <= max; value += 1) order.push(value);
		for (let value = preferred - 1; value >= 0; value -= 1) order.push(value);
		return order;
	}

	function findDropSlot(
		preferredX: number,
		preferredY: number,
		width: number,
		height: number,
		gridCols: number,
		gridRows: number
	): { x: number; y: number } {
		const maxX = Math.max(0, gridCols - width);
		const maxY = Math.max(0, gridRows - height);
		const rowSearchLimit = Math.max(
			maxY,
			items.length > 0 ? Math.max(...items.map((item) => item.y + item.height)) + height : maxY
		);
		const yOrder = buildSearchOrder(Math.min(preferredY, maxY), rowSearchLimit);

		for (const y of yOrder) {
			const xOrder =
				y === preferredY ? buildSearchOrder(preferredX, maxX) : buildSearchOrder(0, maxX);
			for (const x of xOrder) {
				if (!overlapsExistingItem({ x, y, width, height })) {
					return { x, y };
				}
			}
		}

		return { x: 0, y: rowSearchLimit + height };
	}

	function handleSelectObject(childObjectId: string) {
		// Inspect object properties without leaving the current layout view.
		inspectedLayoutObject.set({ layoutObjectId: objectId, objectId: childObjectId });
		sidebarRightVisible.set(true);
	}

	function handleEditPlacement(itemId: string) {
		selectedLayoutContext.set({ layoutObjectId: objectId, layoutType: 'grid', itemId });
		sidebarRightVisible.set(true);
	}

	function trimCanvas() {
		if (items.length === 0) return;
		const [gsx, gsy] = gridSize;
		const maxW = Math.max(...items.map((i) => (i.x + i.width) * gsx));
		const maxH = Math.max(...items.map((i) => (i.y + i.height) * gsy));
		layoutProps = {
			...layoutProps,
			dimensions: [Math.max(1, Math.ceil(maxW)), Math.max(1, Math.ceil(maxH))]
		};
		schedulePatch();
	}

	function handleBringForward(itemId: string) {
		const idx = items.findIndex((i) => i.id === itemId);
		if (idx < 0 || idx >= items.length - 1) return;
		const next = [...items];
		[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
		layoutProps = { ...layoutProps, items: next };
		schedulePatch();
	}

	function handleSendBackward(itemId: string) {
		const idx = items.findIndex((i) => i.id === itemId);
		if (idx <= 0) return;
		const next = [...items];
		[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
		layoutProps = { ...layoutProps, items: next };
		schedulePatch();
	}
</script>

<div
	class="grid-layout-fit"
	class:grid-layout-has-dimensions={scaleToFit}
	style:background={canvasBackground}
	bind:this={fitContainer}
	role="region"
	aria-label="Grid layout"
>
	<div
		class="grid-layout-scaled"
		style="width: {effectiveDimensions[0] * scale}px; height: {effectiveDimensions[1] * scale}px;"
	>
		<ContextMenu.Root>
			<ContextMenu.Trigger
				class="grid-layout-view grid-layout-view-fixed {$gridLayoutEditMode ? 'editing' : ''}"
				style="width: {effectiveDimensions[0]}px; height: {effectiveDimensions[1]}px; transform: scale({scale}); transform-origin: 0 0; background: {canvasBackground};"
				role="region"
				aria-label={items.length === 0
					? $gridLayoutEditMode
						? 'Empty grid layout – drop from tree to add a widget'
						: 'Empty grid layout – click Edit or drop from tree to add a widget'
					: $gridLayoutEditMode
						? 'Grid layout – edit mode'
						: 'Grid layout'}
			>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="grid-layout-view-inner"
					class:grid-layout-view-inner-drop-active={isGridDropActive && items.length > 0}
					ondragenter={handleDragEnter}
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
				>
					{#if items.length > 0 || $gridLayoutEditMode}
						<div
							class="grid-background"
							style:display={showGrid ? 'block' : 'none'}
							style="background-color: {canvasBackground};"
						></div>
					{/if}
					{#each items as item}
						<GridLayoutItemComponent
							{item}
							{gridSize}
							{scale}
							layoutObjectId={objectId}
							editing={$gridLayoutEditMode}
							isPlacementSelected={$selectedLayoutContext?.layoutType === 'grid' &&
								$selectedLayoutContext.itemId === item.id}
							isInspected={$inspectedLayoutObject?.layoutObjectId === objectId &&
								$inspectedLayoutObject?.objectId === item.objectId}
							{showChrome}
							onMove={handleMove}
							onResize={handleResize}
							onSelectObject={handleSelectObject}
							onEditPlacement={handleEditPlacement}
							onRemoveFromLayout={handleRemoveFromLayout}
							onBringForward={handleBringForward}
							onSendBackward={handleSendBackward}
						/>
					{/each}
					{#if items.length === 0}
						<div class="grid-empty-state" class:grid-empty-state-active={isGridDropActive}>
							<div class="grid-empty-state-card" role="status">
								<div class="grid-empty-state-title">
									{isGridDropActive ? 'Drop to add widget' : 'Start this layout from the tree'}
								</div>
								<div class="grid-empty-state-copy">
									{$gridLayoutEditMode
										? 'Drag any object into the empty canvas.'
										: 'Click Edit or drag an object in.'}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</ContextMenu.Trigger>
			<ContextMenu.Content class="min-w-[10rem]">
				<ContextMenu.Item onSelect={trimCanvas} disabled={items.length === 0}>
					Trim canvas
				</ContextMenu.Item>
			</ContextMenu.Content>
		</ContextMenu.Root>
	</div>
</div>

<style>
	.grid-layout-fit {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--mcs-surface-alt);
	}
	.grid-layout-fit.grid-layout-has-dimensions {
		overflow: hidden;
	}

	.grid-layout-scaled {
		flex-shrink: 0;
	}

	:global(.grid-layout-view) {
		width: 100%;
		height: 100%;
		min-height: 0;
		position: relative;
		overflow: auto;
		background: var(--mcs-surface-alt);
	}

	.grid-layout-view-inner {
		position: absolute;
		inset: 0;
	}

	:global(.grid-layout-view-fixed) {
		min-height: 0;
	}
	:global(.grid-layout-view-fixed.editing) .grid-layout-view-inner {
		outline: 2px dashed var(--mcs-border);
		outline-offset: -2px;
	}

	.grid-background {
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0.3;
	}
	.grid-layout-view-inner.grid-layout-view-inner-drop-active::after {
		content: '';
		position: absolute;
		inset: 0.45rem;
		border: 2px dashed color-mix(in oklab, var(--mcs-accent) 70%, var(--mcs-border) 30%);
		border-radius: calc(var(--mcs-radius) + 0.2rem);
		background: color-mix(in oklab, var(--mcs-accent) 7%, transparent);
		pointer-events: none;
	}

	.grid-empty-state {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		inset: 1rem;
		pointer-events: none;
		z-index: 1;
	}

	.grid-empty-state-card {
		display: grid;
		gap: 0.35rem;
		max-width: min(28rem, calc(100% - 2rem));
		padding: 0.9rem 1rem;
		text-align: center;
		color: var(--mcs-text-muted);
		background: color-mix(in oklab, var(--mcs-surface) 92%, white 8%);
		border: 1px dashed color-mix(in oklab, var(--mcs-border) 80%, var(--mcs-accent) 20%);
		border-radius: calc(var(--mcs-radius) + 0.2rem);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--mcs-surface) 70%, transparent);
	}

	.grid-empty-state-title {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--mcs-text);
	}

	.grid-empty-state-copy {
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.grid-empty-state.grid-empty-state-active .grid-empty-state-card {
		border-color: color-mix(in oklab, var(--mcs-accent) 70%, var(--mcs-border) 30%);
		background: color-mix(in oklab, var(--mcs-accent) 10%, var(--mcs-surface) 90%);
	}
</style>
