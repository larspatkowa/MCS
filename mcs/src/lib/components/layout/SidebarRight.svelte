<script lang="ts">
	import PropertiesPanel from '../properties/PropertiesPanel.svelte';
	import { sidebarRightVisible } from '$lib/stores/sidebars';
	import { SlidersHorizontal, PanelRightClose } from '@lucide/svelte';
</script>

<div class="sidebar-right">
	<!-- Header bar -->
	<div class="tab-bar">
		<span class="panel-title">
			<SlidersHorizontal size={13} />
			Properties
		</span>
		<div class="tab-spacer"></div>
		<button
			type="button"
			class="sidebar-toggle"
			aria-label="Hide right panel"
			title="Hide right panel"
			onclick={() => sidebarRightVisible.set(false)}
		>
			<PanelRightClose size={16} />
		</button>
	</div>

	<!-- Content -->
	<div class="sidebar-right-content">
		<PropertiesPanel />
	</div>
</div>

<style>
	.sidebar-right {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--mcs-surface);
	}

	.tab-bar {
		display: flex;
		align-items: center;
		height: var(--mcs-header-height);
		min-height: var(--mcs-header-height);
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
		padding: 0 var(--mcs-header-action-inset);
		gap: 0.5rem;
	}

	.panel-title {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}

	.tab-spacer {
		flex: 1;
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

	.sidebar-right-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
	}
</style>
