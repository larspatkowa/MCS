<script lang="ts">
	import { get } from 'svelte/store';
	import { untrack as svelteUntrack } from 'svelte';
	import { currentProject, inspectedLayoutObject, selectedObject } from '$lib/stores/project';
	import { isDraggingObject } from '$lib/stores/drag.js';
	import { sidebarRightVisible } from '$lib/stores/sidebars';
	import { fetchProjectObject, type ProjectObject } from '$lib/objects/client-cache.js';
	import LazyView from './LazyView.svelte';
	import type { FlexLayoutProps, FlexPane } from '$lib/objects/types.js';
	import { X, ExternalLink, Split, Trash2 } from '@lucide/svelte';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { objectId, props } = $props<{ objectId: string; props: FlexLayoutProps }>();

	function uid() {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	}

	let root = $state<FlexPane>(svelteUntrack(() => props.root ?? { id: uid(), type: 'leaf' }));

	$effect(() => {
		// Track props.root changes only — do NOT re-run just because resizing changes.
		const newRoot = props.root;
		svelteUntrack(() => {
			// Only sync from external changes; ignore while dragging dividers.
			if (!resizing) root = newRoot ?? { id: uid(), type: 'leaf' };
		});
	});

	// ── Object loading ────────────────────────────────────────────────────────
	let objCache = $state<Record<string, ProjectObject | null>>({});
	const inFlightIds = new Set<string>();

	const allObjectIds = $derived.by(() => {
		const ids: string[] = [];
		function collect(p: FlexPane) {
			if (p.type === 'leaf' && p.objectId) ids.push(p.objectId);
			if (p.type === 'split' && p.children) {
				collect(p.children[0]);
				collect(p.children[1]);
			}
		}
		collect(root);
		return ids;
	});

	$effect(() => {
		const proj = $currentProject;
		if (!proj) return;
		for (const id of allObjectIds) {
			if (inFlightIds.has(id)) continue;
			inFlightIds.add(id);
			fetchProjectObject(proj.id, id).then((obj) => {
				objCache = { ...objCache, [id]: obj ?? null };
			});
		}
	});

	// ── Tree mutations ────────────────────────────────────────────────────────
	function cloneTree(p: FlexPane): FlexPane {
		return JSON.parse(JSON.stringify(p));
	}

	function mutatePane(pane: FlexPane, id: string, fn: (p: FlexPane) => void): boolean {
		if (pane.id === id) {
			fn(pane);
			return true;
		}
		if (pane.type === 'split' && pane.children) {
			return mutatePane(pane.children[0], id, fn) || mutatePane(pane.children[1], id, fn);
		}
		return false;
	}

	function findParentOf(pane: FlexPane, id: string): { parent: FlexPane; idx: 0 | 1 } | null {
		if (pane.type !== 'split' || !pane.children) return null;
		if (pane.children[0].id === id) return { parent: pane, idx: 0 };
		if (pane.children[1].id === id) return { parent: pane, idx: 1 };
		return findParentOf(pane.children[0], id) ?? findParentOf(pane.children[1], id);
	}

	function findPaneById(pane: FlexPane, id: string): FlexPane | null {
		if (pane.id === id) return pane;
		if (pane.type === 'split' && pane.children) {
			return findPaneById(pane.children[0], id) ?? findPaneById(pane.children[1], id);
		}
		return null;
	}

	function doSplit(paneId: string, side: 'left' | 'right' | 'top' | 'bottom', newObjId: string) {
		const newRoot = cloneTree(root);
		mutatePane(newRoot, paneId, (p) => {
			const existing = p.objectId;
			if (!existing) {
				p.type = 'leaf';
				p.objectId = newObjId;
				return;
			}
			const isH = side === 'left' || side === 'right';
			const newFirst = side === 'left' || side === 'top';
			p.type = 'split';
			p.direction = isH ? 'horizontal' : 'vertical';
			p.ratio = 0.5;
			p.children = [
				{ id: uid(), type: 'leaf', objectId: newFirst ? newObjId : existing },
				{ id: uid(), type: 'leaf', objectId: newFirst ? existing : newObjId }
			];
			delete p.objectId;
		});
		root = newRoot;
		inFlightIds.delete(newObjId); // allow re-fetch
		schedulePatch();
	}

	function doReplace(paneId: string, newObjId: string) {
		const newRoot = cloneTree(root);
		mutatePane(newRoot, paneId, (p) => {
			p.objectId = newObjId;
		});
		root = newRoot;
		inFlightIds.delete(newObjId);
		schedulePatch();
	}

	function doClose(paneId: string) {
		if (root.id === paneId) {
			root = { id: uid(), type: 'leaf' };
			schedulePatch();
			return;
		}
		const newRoot = cloneTree(root);
		const found = findParentOf(newRoot, paneId);
		if (!found) return;
		const sibling = found.parent.children![found.idx === 0 ? 1 : 0];
		// Promote sibling: copy all fields from sibling into parent
		found.parent.id = sibling.id;
		found.parent.type = sibling.type;
		found.parent.objectId = sibling.objectId;
		found.parent.direction = sibling.direction;
		found.parent.ratio = sibling.ratio;
		found.parent.children = sibling.children;
		root = newRoot;
		schedulePatch();
	}

	function removeLeafAndCollapse(rootPane: FlexPane, paneId: string): FlexPane {
		if (rootPane.id === paneId) return { id: uid(), type: 'leaf' };
		const found = findParentOf(rootPane, paneId);
		if (!found) return rootPane;
		const sibling = found.parent.children![found.idx === 0 ? 1 : 0];
		found.parent.id = sibling.id;
		found.parent.type = sibling.type;
		found.parent.objectId = sibling.objectId;
		found.parent.direction = sibling.direction;
		found.parent.ratio = sibling.ratio;
		found.parent.children = sibling.children;
		return rootPane;
	}

	function doSwapLeafObjects(sourcePaneId: string, targetPaneId: string) {
		if (sourcePaneId === targetPaneId) return;
		const newRoot = cloneTree(root);
		const sourcePane = findPaneById(newRoot, sourcePaneId);
		const targetPane = findPaneById(newRoot, targetPaneId);
		if (!sourcePane || !targetPane || sourcePane.type !== 'leaf' || targetPane.type !== 'leaf')
			return;
		const sourceObjectId = sourcePane.objectId;
		sourcePane.objectId = targetPane.objectId;
		targetPane.objectId = sourceObjectId;
		root = newRoot;
		schedulePatch();
	}

	function doMoveLeafObjectToSplit(
		sourcePaneId: string,
		targetPaneId: string,
		side: 'left' | 'right' | 'top' | 'bottom'
	) {
		if (sourcePaneId === targetPaneId) return;
		const newRoot = cloneTree(root);
		const sourcePane = findPaneById(newRoot, sourcePaneId);
		const targetPane = findPaneById(newRoot, targetPaneId);
		if (!sourcePane || !targetPane || sourcePane.type !== 'leaf' || targetPane.type !== 'leaf')
			return;

		const sourceObjectId = sourcePane.objectId;
		if (!sourceObjectId) return;

		const existing = targetPane.objectId;
		const isH = side === 'left' || side === 'right';
		const newFirst = side === 'left' || side === 'top';
		targetPane.type = 'split';
		targetPane.direction = isH ? 'horizontal' : 'vertical';
		targetPane.ratio = 0.5;
		targetPane.children = [
			{ id: uid(), type: 'leaf', objectId: newFirst ? sourceObjectId : existing },
			{ id: uid(), type: 'leaf', objectId: newFirst ? existing : sourceObjectId }
		];
		delete targetPane.objectId;

		root = removeLeafAndCollapse(newRoot, sourcePaneId);
		schedulePatch();
	}

	// Create an empty sibling pane on the given side (for context menu split)
	function doSplitNewPane(paneId: string, side: 'left' | 'right' | 'top' | 'bottom') {
		const newRoot = cloneTree(root);
		mutatePane(newRoot, paneId, (p) => {
			const existing = p.objectId;
			const isH = side === 'left' || side === 'right';
			const currentFirst = side === 'right' || side === 'bottom';
			p.type = 'split';
			p.direction = isH ? 'horizontal' : 'vertical';
			p.ratio = 0.5;
			p.children = [
				{ id: uid(), type: 'leaf', objectId: currentFirst ? existing : undefined },
				{ id: uid(), type: 'leaf', objectId: currentFirst ? undefined : existing }
			];
			delete p.objectId;
		});
		root = newRoot;
		schedulePatch();
	}

	// ── API persistence ───────────────────────────────────────────────────────
	let patchTimer: ReturnType<typeof setTimeout> | null = null;

	function schedulePatch() {
		if (patchTimer) clearTimeout(patchTimer);
		patchTimer = setTimeout(() => {
			patchTimer = null;
			const proj = $currentProject;
			if (!proj) return;
			const sel = get(selectedObject);
			const body: { props: FlexLayoutProps; expectedUpdatedAt?: string } = { props: { root } };
			if (sel && sel.id === objectId) {
				body.expectedUpdatedAt = sel.updatedAt;
			}
			fetch(`/api/projects/${proj.id}/objects/${objectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		}, 400);
	}

	// ── Divider drag-to-resize ────────────────────────────────────────────────
	type ResizeState = {
		paneId: string;
		dir: 'horizontal' | 'vertical';
		startRatio: number;
		startPx: number;
		totalPx: number;
	};
	let resizing = $state<ResizeState | null>(null);

	function startResize(e: MouseEvent, pane: FlexPane) {
		e.preventDefault();
		const divider = e.currentTarget as HTMLElement;
		const container = divider.parentElement;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const dir = pane.direction ?? 'horizontal';
		resizing = {
			paneId: pane.id,
			dir,
			startRatio: pane.ratio ?? 0.5,
			startPx: dir === 'vertical' ? e.clientY : e.clientX,
			totalPx: dir === 'vertical' ? rect.height : rect.width
		};
	}

	function onWindowMouseMove(e: MouseEvent) {
		if (!resizing) return;
		const px = resizing.dir === 'vertical' ? e.clientY : e.clientX;
		const delta = px - resizing.startPx;
		if (resizing.totalPx <= 0) return;
		const rawRatio = resizing.startRatio + delta / resizing.totalPx;
		const newRatio = Math.max(0.04, Math.min(0.96, Math.round(rawRatio * 100) / 100));
		const newRoot = cloneTree(root);
		mutatePane(newRoot, resizing.paneId, (p) => {
			p.ratio = newRatio;
		});
		root = newRoot;
	}

	function onWindowMouseUp() {
		if (resizing) {
			resizing = null;
			schedulePatch();
		}
	}

	// ── Drag-to-split drop handling ───────────────────────────────────────────
	const DROP_INSET = 0.3;
	let dropTarget = $state<{
		paneId: string;
		zone: 'left' | 'right' | 'top' | 'bottom' | 'center';
	} | null>(null);
	let draggedPaneId = $state<string | null>(null);

	function onPaneChipDragStart(e: DragEvent, paneId: string) {
		draggedPaneId = paneId;
		e.dataTransfer?.setData('mcs-flex-pane-id', paneId);
		e.dataTransfer?.setData('text/plain', paneId);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}

	function onPaneChipDragEnd() {
		draggedPaneId = null;
		dropTarget = null;
	}

	function onLeafDragOver(e: DragEvent, paneId: string) {
		const types = e.dataTransfer?.types ?? [];
		const draggingTreeObject = types.includes('mcs-object-id');
		const draggingPane = types.includes('mcs-flex-pane-id');
		if (!draggingTreeObject && !draggingPane) return;
		if (draggingPane && draggedPaneId === paneId) {
			dropTarget = null;
			return;
		}
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = draggingPane ? 'move' : 'copy';

		// Determine zone from cursor position within the pane
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		const rx = (e.clientX - rect.left) / rect.width;
		const ry = (e.clientY - rect.top) / rect.height;
		const dLeft = rx;
		const dRight = 1 - rx;
		const dTop = ry;
		const dBottom = 1 - ry;
		const minD = Math.min(dLeft, dRight, dTop, dBottom);
		let zone: 'left' | 'right' | 'top' | 'bottom' | 'center' = 'center';
		if (minD < DROP_INSET) {
			if (minD === dLeft) zone = 'left';
			else if (minD === dRight) zone = 'right';
			else if (minD === dTop) zone = 'top';
			else zone = 'bottom';
		}
		dropTarget = { paneId, zone };
	}

	function onLeafDragLeave(e: DragEvent, paneId: string) {
		// Only clear if the related target is outside this pane
		const rt = e.relatedTarget as HTMLElement | null;
		if (!rt || !rt.closest(`[data-pane-id="${paneId}"]`)) {
			if (dropTarget?.paneId === paneId) dropTarget = null;
		}
	}

	function onLeafDrop(e: DragEvent, paneId: string) {
		e.preventDefault();
		const zone = dropTarget?.zone ?? 'center';

		const sourcePaneId = e.dataTransfer?.getData('mcs-flex-pane-id');
		if (sourcePaneId) {
			if (sourcePaneId === paneId) return;
			if (zone === 'center') doSwapLeafObjects(sourcePaneId, paneId);
			else doMoveLeafObjectToSplit(sourcePaneId, paneId, zone);
			dropTarget = null;
			draggedPaneId = null;
			return;
		}
		dropTarget = null;
		const newObjId = e.dataTransfer?.getData('mcs-object-id');
		if (!newObjId) return;
		if (zone === 'center') doReplace(paneId, newObjId);
		else doSplit(paneId, zone, newObjId);
	}
</script>

<svelte:window onmousemove={onWindowMouseMove} onmouseup={onWindowMouseUp} />

{#snippet renderPane(pane: FlexPane)}
	{#if pane.type === 'split' && pane.children}
		{@const isH = (pane.direction ?? 'horizontal') === 'horizontal'}
		{@const r = pane.ratio ?? 0.5}
		<div class="split-wrap" class:split-h={isH} class:split-v={!isH}>
			<div class="split-child" style="{isH ? 'width' : 'height'}: {r * 100}%">
				{@render renderPane(pane.children[0])}
			</div>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="divider"
				class:divider-h={isH}
				class:divider-v={!isH}
				role="separator"
				aria-label="Resize panel divider"
				onmousedown={(e) => startResize(e, pane)}
			>
				<div class="divider-pill"></div>
			</div>
			<div class="split-child split-child-flex">
				{@render renderPane(pane.children[1])}
			</div>
		</div>
	{:else}
		<!-- Leaf pane -->
		{@const obj = pane.objectId ? (objCache[pane.objectId] ?? null) : null}
		{@const isDropOver = dropTarget?.paneId === pane.id}
		<ContextMenu.Root>
			<ContextMenu.Trigger class="leaf-pane-trigger">
				<div
					role="none"
					class="leaf-pane"
					class:has-object={!!obj}
					class:drop-hovering={isDropOver}
					data-pane-id={pane.id}
					ondragover={(e) => onLeafDragOver(e, pane.id)}
					ondragleave={(e) => onLeafDragLeave(e, pane.id)}
					ondrop={(e) => onLeafDrop(e, pane.id)}
				>
					<!-- Object view -->
					{#if obj}
						<div class="pane-titlebar">
							<button
								type="button"
								class="pane-title-handle"
								class:pane-title-inspected={$inspectedLayoutObject?.layoutObjectId === objectId &&
									$inspectedLayoutObject?.objectId === obj.id}
								class:pane-title-dragging={draggedPaneId === pane.id}
								title="Drag to swap panels"
								draggable="true"
								ondragstart={(e) => onPaneChipDragStart(e, pane.id)}
								ondragend={onPaneChipDragEnd}
								onclick={() => {
									inspectedLayoutObject.set({ layoutObjectId: objectId, objectId: obj.id });
									sidebarRightVisible.set(true);
								}}
							>
								<span class="pane-title-text">{obj.name}</span>
							</button>
						</div>
						<!-- pointer-events: none during drag so leaf-pane gets the events -->
						<div class="leaf-content" class:leaf-drag-passive={$isDraggingObject}>
							<LazyView typeId={obj.type} objectId={obj.id} props={obj.props ?? {}} />
						</div>
						<!-- Close / remove button -->
						<button
							class="close-btn"
							title="Remove from layout"
							onclick={() => doClose(pane.id)}
							aria-label="Remove panel"
						>
							<X size={12} />
						</button>
					{:else if pane.objectId}
						<div class="empty-leaf">Loading…</div>
					{:else}
						<div class="empty-leaf">Drop an object here</div>
					{/if}

					<!-- Drop zone targets: shown when dragging over this pane -->
					{#if $isDraggingObject || (isDropOver && draggedPaneId !== pane.id)}
						<div class="drop-zones">
							{#each ['left', 'right', 'top', 'bottom', 'center'] as zone}
								<div
									role="none"
									class="drop-zone dz-{zone}"
									class:dz-active={dropTarget?.paneId === pane.id && dropTarget?.zone === zone}
								></div>
							{/each}
						</div>
					{/if}
				</div>
			</ContextMenu.Trigger>
			<ContextMenu.Content class="min-w-[11rem]">
				{#if obj}
					<ContextMenu.Item
						onSelect={() => {
							inspectedLayoutObject.set({ layoutObjectId: objectId, objectId: obj.id });
							sidebarRightVisible.set(true);
						}}
					>
						Inspect properties
					</ContextMenu.Item>
					<ContextMenu.Separator />
					<ContextMenu.Item
						onSelect={() => {
							const url = new URL($page.url);
							url.searchParams.set('object', obj.id);
							goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
						}}
					>
						<span style="display:flex;align-items:center;gap:0.4rem">
							<ExternalLink size={13} /> Open in Explorer
						</span>
					</ContextMenu.Item>
					<ContextMenu.Separator />
					<ContextMenu.Item onSelect={() => doSplitNewPane(pane.id, 'left')}
						>Split Left</ContextMenu.Item
					>
					<ContextMenu.Item onSelect={() => doSplitNewPane(pane.id, 'right')}
						>Split Right</ContextMenu.Item
					>
					<ContextMenu.Item onSelect={() => doSplitNewPane(pane.id, 'top')}
						>Split Top</ContextMenu.Item
					>
					<ContextMenu.Item onSelect={() => doSplitNewPane(pane.id, 'bottom')}
						>Split Bottom</ContextMenu.Item
					>
					<ContextMenu.Separator />
					<ContextMenu.Item onSelect={() => doClose(pane.id)}>
						<span style="display:flex;align-items:center;gap:0.4rem">
							<Trash2 size={13} /> Remove from Layout
						</span>
					</ContextMenu.Item>
				{:else}
					<ContextMenu.Item>Drop an object here</ContextMenu.Item>
				{/if}
			</ContextMenu.Content>
		</ContextMenu.Root>
	{/if}
{/snippet}

<div
	class="flex-root layout-view"
	class:cursor-col={resizing?.dir === 'horizontal'}
	class:cursor-row={resizing?.dir === 'vertical'}
>
	{@render renderPane(root)}
</div>

<style>
	.flex-root {
		width: 100%;
		height: 100%;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.flex-root.cursor-col,
	.flex-root.cursor-col * {
		cursor: col-resize !important;
		user-select: none;
	}

	.flex-root.cursor-row,
	.flex-root.cursor-row * {
		cursor: row-resize !important;
		user-select: none;
	}

	/* ── Split containers ─────────────────────────────────────── */
	.split-wrap {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
		flex: 1;
	}

	.split-h {
		flex-direction: row;
	}
	.split-v {
		flex-direction: column;
	}

	.split-child {
		overflow: hidden;
		flex-shrink: 0;
		position: relative;
		min-width: 48px;
		min-height: 48px;
	}

	.split-child-flex {
		flex: 1 1 0;
		overflow: hidden;
	}

	/* ── Dividers ─────────────────────────────────────────────── */
	.divider {
		flex-shrink: 0;
		background: var(--mcs-border);
		position: relative;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
	}

	.divider:hover {
		background: var(--mcs-accent, #1a1a1a);
	}

	.divider-h {
		width: 4px;
		cursor: col-resize;
		height: 100%;
	}

	.divider-v {
		height: 4px;
		cursor: row-resize;
		width: 100%;
	}

	.divider-pill {
		background: var(--mcs-text-muted);
		opacity: 0.35;
		border-radius: 2px;
		pointer-events: none;
	}

	.divider-h .divider-pill {
		width: 2px;
		height: 24px;
	}

	.divider-v .divider-pill {
		height: 2px;
		width: 24px;
	}

	.divider:hover .divider-pill {
		background: #fff;
		opacity: 0.6;
	}

	/* ── Leaf panes ───────────────────────────────────────────── */
	:global(.leaf-pane-trigger) {
		display: contents;
	}

	.leaf-pane {
		width: 100%;
		height: 100%;
		position: relative;
		overflow: hidden;
		background: var(--mcs-bg);
	}

	.leaf-content {
		width: 100%;
		height: 100%;
		container-type: size;
		container-name: leaf-pane;
		box-sizing: border-box;
		padding-top: 1.25rem;
	}
	.pane-titlebar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1.25rem;
		z-index: 15;
		display: flex;
		align-items: center;
		pointer-events: auto;
		background: color-mix(in srgb, var(--mcs-bg) 94%, transparent);
		box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--mcs-border) 68%, transparent);
	}
	.pane-title-handle {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
		height: 100%;
		padding: 0 1.6rem 0 0.5rem;
		border: none;
		background: transparent;
		cursor: grab;
		pointer-events: auto;
		appearance: none;
	}
	.pane-title-inspected {
		box-shadow: inset 0 -1px 0 var(--mcs-accent);
	}
	.pane-title-handle:active {
		cursor: grabbing;
	}
	.pane-title-dragging {
		opacity: 0.55;
	}
	.pane-title-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--mcs-text);
	}

	/* During a drag, zero out pointer-events so outer leaf-pane catches ondrop */
	.leaf-drag-passive {
		pointer-events: none !important;
	}

	.empty-leaf {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--mcs-text-muted);
		font-size: 0.8rem;
		font-family: var(--mcs-font-sans);
		border: 1px dashed var(--mcs-border);
		box-sizing: border-box;
	}

	/* ── Close button ─────────────────────────────────────────── */
	.close-btn {
		position: absolute;
		top: 0;
		right: 0.2rem;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		border: none;
		border-radius: 0;
		background: transparent;
		color: var(--mcs-text-muted);
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.12s,
			background 0.12s;
		padding: 0;
	}

	.leaf-pane:hover .close-btn,
	.close-btn:focus-visible {
		opacity: 1;
	}

	.close-btn:hover {
		background: color-mix(in srgb, var(--mcs-surface-alt) 86%, transparent);
		color: var(--mcs-text);
	}

	/* ── Drop zones ───────────────────────────────────────────── */
	.drop-zones {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 30;
	}

	.drop-zone {
		position: absolute;
		/* purely visual — keep pointer-events: none so leaf-pane receives ondrop */
		pointer-events: none;
		transition:
			background 0.1s,
			box-shadow 0.1s;
		box-sizing: border-box;
		background: transparent;
	}

	.dz-left {
		inset: 0;
		clip-path: polygon(0% 0%, 0% 100%, 30% 70%, 30% 30%);
	}
	.dz-right {
		inset: 0;
		clip-path: polygon(100% 0%, 100% 100%, 70% 70%, 70% 30%);
	}
	.dz-top {
		inset: 0;
		clip-path: polygon(0% 0%, 100% 0%, 70% 30%, 30% 30%);
	}
	.dz-bottom {
		inset: 0;
		clip-path: polygon(0% 100%, 100% 100%, 70% 70%, 30% 70%);
	}
	.dz-center {
		inset: 30%;
		border-radius: 2px;
	}

	.drop-zone.dz-active {
		background: color-mix(in srgb, var(--mcs-accent, #1a1a1a) 18%, transparent);
	}

	.drop-zone.dz-active::after {
		content: '';
		position: absolute;
		inset: 0;
		background: color-mix(in srgb, white 14%, transparent);
		pointer-events: none;
	}

	.dz-left.dz-active::after {
		clip-path: polygon(0% 0%, 0% 100%, 15% 85%, 15% 15%);
	}
	.dz-right.dz-active::after {
		clip-path: polygon(100% 0%, 100% 100%, 85% 85%, 85% 15%);
	}
	.dz-top.dz-active::after {
		clip-path: polygon(0% 0%, 100% 0%, 85% 15%, 15% 15%);
	}
	.dz-bottom.dz-active::after {
		clip-path: polygon(0% 100%, 100% 100%, 85% 85%, 15% 85%);
	}

	.dz-left.dz-active {
		box-shadow: inset 1px 0 0 color-mix(in srgb, var(--mcs-accent, #1a1a1a) 80%, transparent);
	}

	.dz-right.dz-active {
		box-shadow: inset -1px 0 0 color-mix(in srgb, var(--mcs-accent, #1a1a1a) 80%, transparent);
	}

	.dz-top.dz-active {
		box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mcs-accent, #1a1a1a) 80%, transparent);
	}

	.dz-bottom.dz-active {
		box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--mcs-accent, #1a1a1a) 80%, transparent);
	}

	.dz-center.dz-active {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mcs-accent, #1a1a1a) 55%, transparent);
	}

	.drop-hovering {
		outline: 1px solid color-mix(in srgb, var(--mcs-accent, #1a1a1a) 50%, transparent);
		outline-offset: -1px;
	}

	.hidden-pane {
		display: none;
	}
</style>
