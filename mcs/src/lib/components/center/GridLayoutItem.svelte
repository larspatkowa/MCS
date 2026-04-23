<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import { sidebarRightVisible } from '$lib/stores/sidebars';
	import type { GridLayoutItem as GridItem } from '$lib/objects/types.js';
	import { fetchProjectObject } from '$lib/objects/client-cache.js';
	import {
		calculateSnappedPosition,
		updateDragPosition,
		createDragState,
		type DragState
	} from './grid-layout-drag.js';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import LazyView from './LazyView.svelte';

	let {
		item,
		gridSize,
		scale = 1,
		layoutObjectId,
		editing = false,
		isPlacementSelected = false,
		isInspected = false,
		onMove,
		onResize,
		onSelect,
		onSelectObject,
		onEditPlacement,
		onRemoveFromLayout,
		onBringForward,
		onSendBackward
	}: {
		item: GridItem;
		gridSize: [number, number];
		scale?: number;
		layoutObjectId?: string;
		editing?: boolean;
		isPlacementSelected?: boolean;
		isInspected?: boolean;
		onMove?: (itemId: string, x: number, y: number) => void;
		onResize?: (itemId: string, x: number, y: number, width: number, height: number) => void;
		onSelect?: (itemId: string) => void;
		onSelectObject?: (objectId: string) => void;
		onEditPlacement?: (itemId: string) => void;
		onRemoveFromLayout?: (itemId: string) => void;
		onBringForward?: (itemId: string) => void;
		onSendBackward?: (itemId: string) => void;
	} = $props();

	let obj = $state<{
		id: string;
		type: string;
		name: string;
		props: Record<string, unknown>;
	} | null>(null);
	let dragState = $state<DragState | null>(null);
	let isDragging = $state(false);
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);
	let itemFetchSeq = 0;
	let loadedItemKey = '';

	$effect(() => {
		const proj = $currentProject;
		if (!proj) {
			obj = null;
			loadedItemKey = '';
			return;
		}
		const oid = item.objectId ?? '';
		if (!oid) {
			obj = null;
			loadedItemKey = '';
			return;
		}
		const key = `${proj.id}:${oid}`;
		if (loadedItemKey === key && obj?.id === oid) return;
		loadedItemKey = key;
		const seq = ++itemFetchSeq;
		fetchProjectObject(proj.id, oid).then((o) => {
			if (seq !== itemFetchSeq) return;
			obj = o;
		});
	});

	function getClientCoords(e: PointerEvent): { clientX: number; clientY: number } {
		return { clientX: e.clientX, clientY: e.clientY };
	}

	function startDrag(e: PointerEvent) {
		if (!editing) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
		isDragging = true;
		dragState = createDragState(
			e.clientX,
			e.clientY,
			{
				x: item.x * gridSize[0],
				y: item.y * gridSize[1],
				width: item.width * gridSize[0],
				height: item.height * gridSize[1]
			},
			gridSize
		);
		onSelect?.(item.id);
	}

	function startResize(e: PointerEvent, handle: string) {
		if (!editing) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
		isResizing = true;
		resizeHandle = handle;
		dragState = createDragState(
			e.clientX,
			e.clientY,
			{
				x: item.x * gridSize[0],
				y: item.y * gridSize[1],
				width: item.width * gridSize[0],
				height: item.height * gridSize[1]
			},
			gridSize
		);
		onSelect?.(item.id);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragState) return;
		const { clientX, clientY } = getClientCoords(e);
		if (isDragging) {
			const newPos = updateDragPosition(dragState, clientX, clientY, 'move', undefined, scale);
			const snapped = calculateSnappedPosition(newPos, gridSize);
			const gridX = Math.round(snapped.x / gridSize[0]);
			const gridY = Math.round(snapped.y / gridSize[1]);
			onMove?.(item.id, gridX, gridY);
		} else if (isResizing && resizeHandle) {
			const newPos = updateDragPosition(
				dragState,
				clientX,
				clientY,
				'resize',
				resizeHandle as 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w',
				scale
			);
			const snapped = calculateSnappedPosition(newPos, gridSize, {
				minWidth: gridSize[0],
				minHeight: gridSize[1]
			});
			const gridX = Math.round(snapped.x / gridSize[0]);
			const gridY = Math.round(snapped.y / gridSize[1]);
			const gridWidth = Math.round(snapped.width / gridSize[0]);
			const gridHeight = Math.round(snapped.height / gridSize[1]);
			onResize?.(item.id, gridX, gridY, gridWidth, gridHeight);
		}
	}

	function handleEnd() {
		isDragging = false;
		isResizing = false;
		resizeHandle = null;
		dragState = null;
	}

	$effect(() => {
		if (!(isDragging || isResizing)) return;
		const onPointerMove = (e: PointerEvent) => handlePointerMove(e);
		const onPointerUp = () => handleEnd();
		document.addEventListener('pointermove', onPointerMove);
		document.addEventListener('pointerup', onPointerUp);
		document.addEventListener('pointercancel', onPointerUp);
		return () => {
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
			document.removeEventListener('pointercancel', onPointerUp);
		};
	});
</script>

<ContextMenu.Root>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<ContextMenu.Trigger
		class="grid-layout-item {editing ? 'editing' : ''} {isPlacementSelected
			? ' placement-selected'
			: ''} {isInspected ? ' inspected' : ''} {editing || isDragging || isResizing ? 'touch-none' : ''}"
		style="left: {item.x * gridSize[0]}px; top: {item.y * gridSize[1]}px; width: {item.width *
			gridSize[0]}px; height: {item.height * gridSize[1]}px;"
		onpointerdown={startDrag}
		role="region"
		aria-label="Layout item {obj?.name ?? item.id}"
	>
		{#if obj}
			<div class="item-titlebar">
				<button
					type="button"
					class="item-titlebtn"
					aria-label="Inspect {obj.name}"
					title="Inspect properties"
					onclick={(e) => {
						e.stopPropagation();
						onSelectObject?.(item.objectId);
					}}
				>
					<span class="item-title">{obj.name}</span>
				</button>
			</div>
			<div class="item-content">
				<LazyView typeId={obj.type} objectId={obj.id} props={obj.props ?? {}} />
			</div>
		{:else}
			<div class="placeholder">Loading...</div>
		{/if}

		<div class="resize-handles" class:visible={editing} role="group" aria-label="Resize handles">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle nw" onpointerdown={(e) => startResize(e, 'nw')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle ne" onpointerdown={(e) => startResize(e, 'ne')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle sw" onpointerdown={(e) => startResize(e, 'sw')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle se" onpointerdown={(e) => startResize(e, 'se')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle n" onpointerdown={(e) => startResize(e, 'n')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle s" onpointerdown={(e) => startResize(e, 's')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle e" onpointerdown={(e) => startResize(e, 'e')}></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="handle w" onpointerdown={(e) => startResize(e, 'w')}></div>
		</div>
	</ContextMenu.Trigger>
	<ContextMenu.Content class="min-w-[10rem]">
		<ContextMenu.Item
			onSelect={() => {
				onSelect?.(item.id);
				onSelectObject?.(item.objectId);
			}}>Select</ContextMenu.Item
		>
		<ContextMenu.Item
			onSelect={() => {
				sidebarRightVisible.set(true);
				onSelectObject?.(item.objectId);
			}}>Edit properties</ContextMenu.Item
		>
		{#if layoutObjectId}
			<ContextMenu.Item onSelect={() => onEditPlacement?.(item.id)}>Edit placement</ContextMenu.Item
			>
		{/if}
		{#if onBringForward}
			<ContextMenu.Item onSelect={() => onBringForward(item.id)}>Bring forward</ContextMenu.Item>
		{/if}
		{#if onSendBackward}
			<ContextMenu.Item onSelect={() => onSendBackward(item.id)}>Send backward</ContextMenu.Item>
		{/if}
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={() => onRemoveFromLayout?.(item.id)}
			>Remove from layout</ContextMenu.Item
		>
	</ContextMenu.Content>
</ContextMenu.Root>

<style>
	:global(.grid-layout-item) {
		position: absolute;
		border: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
		min-width: 100px;
		min-height: 100px;
		overflow: visible;
	}

	:global(.grid-layout-item.editing) {
		border-color: var(--mcs-accent);
		cursor: move;
	}
	:global(.grid-layout-item.touch-none) {
		touch-action: none;
	}
	:global(.grid-layout-item.placement-selected) {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
		z-index: 1;
	}
	:global(.grid-layout-item.inspected) {
		outline: 2px solid color-mix(in oklab, var(--mcs-accent) 55%, var(--mcs-border) 45%);
		outline-offset: 2px;
		z-index: 1;
	}

	.item-content {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		padding-top: 1.2rem;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.item-titlebar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1.2rem;
		z-index: 2;
		display: flex;
		align-items: center;
		padding: 0 0.5rem;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--mcs-bg) 94%, transparent) 0%,
			color-mix(in srgb, var(--mcs-bg) 82%, transparent) 70%,
			color-mix(in srgb, var(--mcs-bg) 20%, transparent) 100%
		);
		box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--mcs-border) 68%, transparent);
	}
	.item-titlebtn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		max-width: 100%;
		height: 1.2rem;
		padding: 0;
		margin: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		color: inherit;
		font: inherit;
	}
	.item-titlebtn:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.item-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--mcs-text);
	}

	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 0.85rem;
	}

	.resize-handles {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.resize-handles.visible {
		pointer-events: all;
	}

	.handle {
		position: absolute;
		width: 8px;
		height: 8px;
		background: var(--mcs-accent);
		border: 1px solid var(--mcs-surface);
		border-radius: 50%;
		pointer-events: none;
		cursor: nwse-resize;
		touch-action: none;
		opacity: 0;
		z-index: 10;
	}
	.resize-handles.visible .handle {
		opacity: 1;
		pointer-events: all;
	}

	.handle.nw {
		top: -4px;
		left: -4px;
		cursor: nwse-resize;
	}

	.handle.ne {
		top: -4px;
		right: -4px;
		cursor: nesw-resize;
	}

	.handle.sw {
		bottom: -4px;
		left: -4px;
		cursor: nesw-resize;
	}

	.handle.se {
		bottom: -4px;
		right: -4px;
		cursor: nwse-resize;
	}

	.handle.n {
		top: -4px;
		left: 50%;
		margin-left: -4px;
		cursor: ns-resize;
	}

	.handle.s {
		bottom: -4px;
		left: 50%;
		margin-left: -4px;
		cursor: ns-resize;
	}

	.handle.e {
		right: -4px;
		top: 50%;
		margin-top: -4px;
		cursor: ew-resize;
	}

	.handle.w {
		left: -4px;
		top: 50%;
		margin-top: -4px;
		cursor: ew-resize;
	}
</style>
