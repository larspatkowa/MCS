<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import HeaderBar from './HeaderBar.svelte';
	import SidebarLeft from './SidebarLeft.svelte';
	import CenterView from './CenterView.svelte';
	import SidebarRight from './SidebarRight.svelte';
	import BottomBar from './BottomBar.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import {
		sidebarLeftVisible,
		sidebarRightVisible,
		sidebarLeftWidthPx,
		sidebarRightWidthPx,
		LEFT_WIDTH_MIN,
		LEFT_WIDTH_MAX,
		RIGHT_WIDTH_MIN,
		RIGHT_WIDTH_MAX,
		LEFT_WIDTH_DEFAULT,
		RIGHT_WIDTH_DEFAULT
	} from '$lib/stores/sidebars';
	import { currentProject, selectedObjectId } from '$lib/stores/project';
	import { commandPaletteOpen } from '$lib/stores/commandPalette';
	import { settingsModalOpen, addObjectModalOpen } from '$lib/stores/settings';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	function startResizeLeft(e: MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = get(sidebarLeftWidthPx);

		function move(ev: MouseEvent) {
			const delta = ev.clientX - startX;
			sidebarLeftWidthPx.set(Math.max(LEFT_WIDTH_MIN, Math.min(LEFT_WIDTH_MAX, startW + delta)));
		}
		function stop() {
			document.removeEventListener('mousemove', move);
			document.removeEventListener('mouseup', stop);
		}
		document.addEventListener('mousemove', move);
		document.addEventListener('mouseup', stop);
	}

	function startResizeRight(e: MouseEvent) {
		e.preventDefault();
		const startX = e.clientX;
		const startW = get(sidebarRightWidthPx);

		function move(ev: MouseEvent) {
			const delta = startX - ev.clientX;
			sidebarRightWidthPx.set(Math.max(RIGHT_WIDTH_MIN, Math.min(RIGHT_WIDTH_MAX, startW + delta)));
		}
		function stop() {
			document.removeEventListener('mousemove', move);
			document.removeEventListener('mouseup', stop);
		}
		document.addEventListener('mousemove', move);
		document.addEventListener('mouseup', stop);
	}

	onMount(() => {
		// On narrow viewports default sidebars to collapsed so center content fits (only when no saved preference)
		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(max-width: 1024px)').matches &&
			localStorage.getItem('mcs-sidebar-left') === null &&
			localStorage.getItem('mcs-sidebar-right') === null
		) {
			sidebarLeftVisible.set(false);
			sidebarRightVisible.set(false);
		}
	});

	function handleGlobalKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (get(commandPaletteOpen)) return; // command palette handles its own Escape
		if (get(settingsModalOpen)) {
			settingsModalOpen.set(false);
			return;
		}
		if (get(addObjectModalOpen)) return; // add object modal handles its own Escape
		const proj = $currentProject;
		const sel = get(selectedObjectId);
		if (proj && sel) {
			goto(`/project/${proj.id}`);
		}
	}

	const isDisplayMode = $derived(
		$page.url.searchParams.get('display') === '1' ||
			$page.url.searchParams.get('display') === 'true'
	);
	const showDisplayTimeBar = $derived(
		$page.url.searchParams.get('timebar') === '1' ||
			$page.url.searchParams.get('timebar') === 'true'
	);
	const showBottomBar = $derived.by(() => {
		if (isDisplayMode) return showDisplayTimeBar;
		return true;
	});
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<SettingsModal />
<CommandPalette />
<div class="shell" data-layout-fullscreen-root class:display-mode={isDisplayMode}>
	{#if !isDisplayMode}
		<header class="header">
			<HeaderBar />
		</header>
	{/if}
	<div class="main-row">
		{#if !isDisplayMode}
			<aside
				class="sidebar-left"
				class:hidden={!$sidebarLeftVisible}
				style:width={$sidebarLeftVisible ? `${$sidebarLeftWidthPx}px` : undefined}
			>
				<SidebarLeft />
			</aside>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="resizer resizer-left"
				class:hidden={!$sidebarLeftVisible}
				role="separator"
				aria-label="Resize left sidebar; double-click to reset width"
				onmousedown={startResizeLeft}
				ondblclick={() => sidebarLeftWidthPx.set(LEFT_WIDTH_DEFAULT)}
			></div>
		{/if}
		<main class="center">
			<CenterView />
		</main>
		{#if !isDisplayMode}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="resizer resizer-right"
				class:hidden={!$sidebarRightVisible}
				role="separator"
				aria-label="Resize right sidebar; double-click to reset width"
				onmousedown={startResizeRight}
				ondblclick={() => sidebarRightWidthPx.set(RIGHT_WIDTH_DEFAULT)}
			></div>
			<aside
				class="sidebar-right"
				class:hidden={!$sidebarRightVisible}
				style:width={$sidebarRightVisible ? `${$sidebarRightWidthPx}px` : undefined}
			>
				<SidebarRight />
			</aside>
		{/if}
	</div>
	{#if showBottomBar}
		<footer class="bottom-bar">
			<BottomBar />
		</footer>
	{/if}
</div>

<style>
	.shell {
		display: grid;
		grid-template-rows: auto 1fr auto;
		grid-template-columns: 1fr;
		grid-template-areas:
			'header'
			'main'
			'bottom';
		height: 100vh;
		width: 100%;
		background: var(--mcs-bg);
		color: var(--mcs-text);
	}
	.shell.display-mode {
		grid-template-rows: 1fr;
		grid-template-areas: 'main';
	}
	.header {
		grid-area: header;
		border-bottom: 1px solid var(--mcs-border);
		min-height: var(--mcs-header-height);
	}
	.main-row {
		grid-area: main;
		display: flex;
		flex-direction: row;
		min-height: 0;
		min-width: 0;
	}
	.sidebar-left {
		flex: 0 0 auto;
		border-right: 1px solid var(--mcs-border);
		overflow: hidden;
	}
	.sidebar-left.hidden {
		flex: 0 0 0;
		min-width: 0;
		width: 0;
		overflow: hidden;
		border-right: none;
		padding: 0;
	}
	.resizer {
		flex: 0 0 2px;
		background: var(--mcs-resizer);
		cursor: col-resize;
	}
	.resizer:hover {
		background: var(--mcs-accent);
	}
	.resizer.hidden {
		flex: 0 0 0;
		width: 0;
		min-width: 0;
		cursor: default;
	}
	.center {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}
	.sidebar-right {
		flex: 0 0 auto;
		border-left: 1px solid var(--mcs-border);
		overflow: hidden;
	}
	.sidebar-right.hidden {
		flex: 0 0 0;
		min-width: 0;
		width: 0;
		overflow: hidden;
		border-left: none;
		padding: 0;
	}
	.bottom-bar {
		grid-area: bottom;
		position: relative;
		z-index: 20;
		border-top: 1px solid var(--mcs-border);
		min-height: 2rem;
	}
	:global([data-layout-fullscreen-root]:fullscreen) {
		width: 100%;
		height: 100%;
	}
	@media (max-width: 700px) {
		.sidebar-left,
		.sidebar-right,
		.resizer {
			display: none;
		}
	}
</style>
