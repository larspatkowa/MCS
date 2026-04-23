<script lang="ts">
	import ObjectTree from '../tree/ObjectTree.svelte';
	import AddObjectButton from '../tree/AddObjectButton.svelte';
	import { sidebarLeftVisible } from '$lib/stores/sidebars';
	import { FolderTree, PanelLeftClose } from '@lucide/svelte';

	let sidebarEl: HTMLDivElement | undefined = $state();
</script>

<div class="sidebar-left" bind:this={sidebarEl} data-sidebar-left data-tutorial="sidebar-tree">
	<div class="section-title">
		<span class="section-title-start">
			<button
				type="button"
				class="sidebar-toggle"
				aria-label="Hide Explorer"
				title="Hide Explorer"
				onclick={() => sidebarLeftVisible.set(false)}
			>
				<PanelLeftClose size={16} />
			</button>
			<AddObjectButton />
		</span>
		<span class="section-title-left">
			<span class="section-title-label">Explorer</span>
			<FolderTree size={14} />
		</span>
	</div>
	<div class="sidebar-left-content">
		<ObjectTree />
	</div>
</div>

<style>
	.sidebar-left {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--mcs-surface);
		container-type: inline-size;
		container-name: sidebar-left;
	}
	.section-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		height: var(--mcs-header-height);
		min-height: var(--mcs-header-height);
		padding: 0 var(--mcs-header-action-inset);
		font-size: 0.75rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}
	.section-title-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		overflow: hidden;
	}
	.section-title-left :global(svg) {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		min-width: 14px;
		min-height: 14px;
	}
	.section-title-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.section-title-start {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
	}
	.section-title-start :global(.add-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--mcs-header-toggle-size);
		height: var(--mcs-header-toggle-size);
		min-width: var(--mcs-header-toggle-size);
		padding: 0;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		border-radius: var(--mcs-radius);
	}
	.section-title-start :global(.add-btn:hover) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.section-title-start :global(.add-btn:focus-visible) {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.section-title-start :global(.add-btn .add-btn-text) {
		display: none;
	}
	.section-title-start :global(.add-btn svg) {
		width: 16px;
		height: 16px;
	}
	.sidebar-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--mcs-header-toggle-size);
		height: var(--mcs-header-toggle-size);
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		padding: 0;
		margin: 0;
		cursor: pointer;
		border-radius: var(--mcs-radius);
	}
	.sidebar-toggle:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.sidebar-toggle:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.sidebar-left-content {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
