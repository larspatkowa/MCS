<script lang="ts">
	import type { StackProps } from '$lib/objects/types.js';
	import LazyView from './LazyView.svelte';
	import { useChildObjects } from './ChildViews.svelte.js';

	let { objectId, props } = $props<{ objectId: string; props: StackProps }>();

	const childObjects = useChildObjects(() => objectId);
	const children = $derived(childObjects.children);
	const minHeight = $derived(Math.max(80, props.minRowHeight ?? 180));
</script>

<div class="stack-root" style:--row-min="{minHeight}px">
	{#each children as child (child.id)}
		<section class="row" aria-label={child.name}>
			{#if props.showTitles !== false}<h3>{child.name}</h3>{/if}
			<div class="view">
				<LazyView typeId={child.type} objectId={child.id} props={child.props ?? {}} />
			</div>
		</section>
	{:else}
		<p class="empty">
			Add objects to this stack in the tree. Children share the time conductor, so stacked plots
			stay aligned in time.
		</p>
	{/each}
</div>

<style>
	.stack-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		font-family: var(--mcs-font-sans);
	}
	.row {
		flex: 1 0 var(--row-min);
		display: flex;
		flex-direction: column;
		min-height: var(--row-min);
		border-bottom: 1px solid var(--mcs-border);
	}
	.row:last-child {
		border-bottom: none;
	}
	h3 {
		margin: 0;
		padding: 4px 10px 0;
		font-size: 11px;
		font-weight: 500;
		color: var(--mcs-text-muted);
	}
	.view {
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
