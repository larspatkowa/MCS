<script lang="ts">
	import CenterContent from '../center/CenterContent.svelte';
	import CenterHeaderBar from './CenterHeaderBar.svelte';
	import {
		currentProject,
		selectedObjectId,
		selectedObjectVersion,
		selectedObject,
		selectedObjectLoading,
		selectedObjectError
	} from '$lib/stores/project';
	import { sidebarLeftVisible, sidebarRightVisible } from '$lib/stores/sidebars';
	import { PanelLeftOpen, PanelRightOpen } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';

	let fetchSeq = 0;
	const isDisplayMode = $derived(
		$page.url.searchParams.get('display') === '1' ||
			$page.url.searchParams.get('display') === 'true'
	);
	const headerLeftInset = $derived(
		!$sidebarLeftVisible ? 'calc(var(--mcs-header-toggle-size) + 0.45rem)' : '0px'
	);
	const headerRightInset = $derived(
		!$sidebarRightVisible ? 'calc(var(--mcs-header-toggle-size) + 0.45rem)' : '0px'
	);

	$effect(() => {
		const proj = $currentProject;
		const id = $selectedObjectId;
		const version = $selectedObjectVersion;
		const seq = ++fetchSeq;
		if (!proj || !id) {
			selectedObject.set(null);
			selectedObjectLoading.set(false);
			selectedObjectError.set(null);
			return;
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort('timeout'), 10000);

		selectedObjectError.set(null);
		selectedObjectLoading.set(true);
		const optimisticObject = get(selectedObject);
		if (!optimisticObject || optimisticObject.id !== id) {
			selectedObject.set(null);
		}
		fetch(`/api/projects/${proj.id}/objects/${id}?v=${version}`, { signal: controller.signal })
			.then(async (res) => {
				if (seq !== fetchSeq) return;
				if (!res.ok) {
					const text = await res.text();
					if (res.status === 404) {
						selectedObject.set(null);
						selectedObjectError.set('Object not found');
						return;
					}
					const currentObject = get(selectedObject);
					if (!currentObject || currentObject.id !== id) {
						selectedObject.set(null);
						selectedObjectError.set(text || `Failed to load (${res.status})`);
					}
					return;
				}
				const obj = (await res.json()) as import('$lib/objects/types.js').MCSObject & {
					parentId?: string;
				};
				selectedObject.set(obj);
				selectedObjectError.set(null);
			})
			.catch((err) => {
				if (seq !== fetchSeq) return;
				const message =
					err?.name === 'AbortError'
						? 'Object request timed out'
						: (err?.message ?? 'Failed to load object');
				const currentObject = get(selectedObject);
				if (!currentObject || currentObject.id !== id) {
					selectedObject.set(null);
					selectedObjectError.set(message);
				}
			})
			.finally(() => {
				clearTimeout(timeout);
				if (seq === fetchSeq) selectedObjectLoading.set(false);
			});

		return () => {
			clearTimeout(timeout);
			controller.abort();
		};
	});
</script>

<div class="center-view">
	{#if !isDisplayMode}
		<div class="center-view-header">
			{#if !$sidebarLeftVisible}
				<button
					type="button"
					class="center-header-toggle center-header-toggle-left"
					aria-label="Show Explorer"
					title="Show Explorer"
					onclick={() => sidebarLeftVisible.set(true)}
				>
					<PanelLeftOpen size={16} />
				</button>
			{/if}
			<div
				class="center-view-header-center"
				style:padding-left={headerLeftInset}
				style:padding-right={headerRightInset}
			>
				<CenterHeaderBar />
			</div>
			{#if !$sidebarRightVisible}
				<button
					type="button"
					class="center-header-toggle center-header-toggle-right"
					aria-label="Show Properties"
					title="Show Properties"
					onclick={() => sidebarRightVisible.set(true)}
				>
					<PanelRightOpen size={16} />
				</button>
			{/if}
		</div>
	{/if}
	<div class="center-view-content">
		<CenterContent />
	</div>
</div>

<style>
	.center-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		background: var(--mcs-bg);
		min-height: 0;
		position: relative;
	}
	.center-view-header {
		display: flex;
		align-items: center;
		position: relative;
		height: var(--mcs-header-height);
		min-height: var(--mcs-header-height);
		flex-shrink: 0;
		padding: 0 0.5rem;
		background: var(--mcs-surface);
		border-bottom: 1px solid var(--mcs-border);
	}
	.center-view-header-center {
		flex: 1;
		min-width: 0;
	}
	.center-header-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--mcs-header-toggle-size);
		height: var(--mcs-header-toggle-size);
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		padding: 0;
		cursor: pointer;
		border-radius: var(--mcs-radius);
		flex-shrink: 0;
	}
	.center-header-toggle-left {
		position: absolute;
		left: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
	}
	.center-header-toggle-right {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
	}
	.center-header-toggle:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.center-header-toggle:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.center-view-content {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
