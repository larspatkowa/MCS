<script lang="ts">
	import { get } from 'svelte/store';
	import { currentProject, invalidateSelectedObject, selectedObject } from '$lib/stores/project';
	import { isDraggingObject } from '$lib/stores/drag.js';
	import { fetchProjectObject } from '$lib/objects/client-cache.js';
	import type { StackProps } from '$lib/objects/types.js';
	import LazyView from './LazyView.svelte';

	let { objectId, props } = $props<{ objectId: string; props?: StackProps }>();

	let stackProps = $state<StackProps>({});
	const objectIds = $derived((stackProps.objectIds ?? []) as string[]);
	const autoCycleSeconds = $derived((stackProps.autoCycleSeconds as number | undefined) ?? 0);

	let activeIndex = $state(0);
	const activeIndexRef = { current: 0 };
	let patchTimeout: ReturnType<typeof setTimeout> | null = null;
	let cycleInterval: ReturnType<typeof setInterval> | null = null;

	let tabLabels = $state<Record<string, string>>({});
	let activeFetchSeq = 0;
	let activeObjectKey = '';

	const clampedActiveIndex = $derived.by(() => {
		const n = objectIds.length;
		if (n === 0) return 0;
		const idx = Math.max(0, Math.min(activeIndex, n - 1));
		return idx;
	});

	const activeObjectId = $derived.by(() => {
		const ids = objectIds;
		if (ids.length === 0) return '';
		return ids[clampedActiveIndex] ?? '';
	});

	let activeObj = $state<{
		id: string;
		type: string;
		name: string;
		props: Record<string, unknown>;
	} | null>(null);

	$effect(() => {
		const nextProps = (props ?? {}) as StackProps;
		stackProps = nextProps;
		const raw = (nextProps.activeIndex as number | undefined) ?? 0;
		const ids = (nextProps.objectIds ?? []) as string[];
		const n = ids.length;
		const clamped = n === 0 ? 0 : Math.max(0, Math.min(raw, n - 1));
		activeIndex = clamped;
		activeIndexRef.current = clamped;
	});

	$effect(() => {
		const ids = objectIds;
		const idx = activeIndex;
		const n = ids.length;
		if (n === 0) {
			activeIndex = 0;
			return;
		}
		if (idx < 0 || idx >= n) {
			activeIndex = Math.max(0, n - 1);
		}
	});

	$effect(() => {
		const proj = $currentProject;
		const labels = tabLabels;
		if (!proj) return;
		objectIds.forEach((oid) => {
			if (labels[oid] !== undefined) return;
			fetchProjectObject(proj.id, oid).then((o) => {
				tabLabels = {
					...tabLabels,
					[oid]: o?.name != null ? o.name : oid || '?'
				};
			});
		});
	});

	$effect(() => {
		const oid = activeObjectId;
		const proj = $currentProject;
		if (!oid || !proj) {
			activeObj = null;
			activeObjectKey = '';
			return;
		}
		const key = `${proj.id}:${oid}`;
		if (activeObjectKey === key && activeObj?.id === oid) return;
		activeObjectKey = key;
		const seq = ++activeFetchSeq;
		fetchProjectObject(proj.id, oid).then((o) => {
			if (seq !== activeFetchSeq) return;
			activeObj = o;
		});
	});

	function schedulePatch() {
		if (patchTimeout) clearTimeout(patchTimeout);
		patchTimeout = setTimeout(() => {
			patchTimeout = null;
			const proj = $currentProject;
			if (!proj || proj.id === 'gallery') return;
			const sel = get(selectedObject);
			const body: { props: StackProps; expectedUpdatedAt?: string } = {
				props: { ...stackProps, activeIndex }
			};
			if (sel?.id === objectId && sel) body.expectedUpdatedAt = sel.updatedAt;
			fetch(`/api/projects/${proj.id}/objects/${objectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			}).then((r) => {
				if (r.ok || r.status === 409) invalidateSelectedObject();
			});
		}, 300);
	}

	function selectTab(index: number) {
		activeIndex = index;
		activeIndexRef.current = index;
		stackProps = { ...stackProps, activeIndex: index };
		schedulePatch();
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('mcs-object-id');
		if (!id) return;
		const ids = [...objectIds];
		if (ids.includes(id)) return;
		ids.push(id);
		stackProps = { ...stackProps, objectIds: ids };
		schedulePatch();
	}

	$effect(() => {
		activeIndexRef.current = activeIndex;
	});

	$effect(() => {
		const sec = autoCycleSeconds;
		const ids = objectIds;
		if (sec <= 0 || ids.length <= 1) {
			if (cycleInterval) {
				clearInterval(cycleInterval);
				cycleInterval = null;
			}
			return;
		}
		cycleInterval = setInterval(() => {
			const n = ids.length;
			if (n <= 1) return;
			const next = (activeIndexRef.current + 1) % n;
			activeIndexRef.current = next;
			activeIndex = next;
			stackProps = { ...stackProps, activeIndex: next };
			schedulePatch();
		}, sec * 1000);
		return () => {
			if (cycleInterval) {
				clearInterval(cycleInterval);
				cycleInterval = null;
			}
		};
	});
</script>

<div
	class="stack-view"
	role="region"
	aria-label="Stack"
	ondragover={(e) => e.preventDefault()}
	ondrop={handleDrop}
>
	{#if objectIds.length > 0}
		<div class="stack-tabs" role="tablist">
			{#each objectIds as oid, i}
				<button
					type="button"
					class="stack-tab"
					class:active={i === clampedActiveIndex}
					role="tab"
					aria-selected={i === clampedActiveIndex}
					onclick={() => selectTab(i)}
				>
					{tabLabels[oid] ?? (oid || '?')}
				</button>
			{/each}
		</div>
	{/if}
	<div class="stack-content">
		{#if $isDraggingObject}
			<!-- Overlay so drop fires on stack when user drops over child view (plot, gauge, etc.) -->
			<div
				class="stack-drop-overlay"
				role="presentation"
				aria-hidden="true"
				ondragover={(e) => e.preventDefault()}
				ondrop={handleDrop}
			>
				<div class="stack-drop-label">Drop to add to stack</div>
			</div>
		{/if}
		{#if activeObjectId && activeObj}
			<LazyView typeId={activeObj.type} objectId={activeObj.id} props={activeObj.props ?? {}} />
		{:else if activeObjectId}
			<div class="stack-placeholder">Object missing</div>
		{:else}
			<div class="stack-placeholder">Drop objects here to add to stack</div>
		{/if}
	</div>
</div>

<style>
	.stack-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		width: 100%;
	}
	.stack-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		flex-shrink: 0;
	}
	.stack-tab {
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
		font-family: var(--mcs-font-sans);
		color: var(--mcs-text-muted);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
	}
	.stack-tab:hover {
		color: var(--mcs-text);
	}
	.stack-tab.active {
		color: var(--mcs-text);
		background: var(--mcs-surface);
		border-bottom-color: var(--mcs-accent);
	}
	.stack-content {
		flex: 1;
		min-height: 0;
		position: relative;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
	}
	.stack-drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: all;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in oklab, var(--mcs-accent) 10%, transparent);
		border: 2px dashed color-mix(in oklab, var(--mcs-accent) 75%, var(--mcs-border) 25%);
	}
	.stack-drop-label {
		padding: 0.45rem 0.65rem;
		font-size: 0.8rem;
		font-family: var(--mcs-font-sans);
		color: var(--mcs-text-muted);
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
	}
	.stack-content :global(> *) {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}
	.stack-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 0.9rem;
	}
</style>
