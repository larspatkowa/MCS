<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentProject } from '$lib/stores/project';
	import { theme } from '$lib/stores/theme';
	import { settingsModalOpen } from '$lib/stores/settings';
	import { commandPaletteOpen } from '$lib/stores/commandPalette';
	import {
		Root as DropdownMenuRoot,
		Trigger as DropdownMenuTrigger,
		Content as DropdownMenuContent,
		Item as DropdownMenuItem,
		Group as DropdownMenuGroup,
		GroupHeading as DropdownMenuGroupHeading,
		Portal as DropdownMenuPortal
	} from '$lib/components/ui/dropdown-menu';
	import { Sun, Moon, Settings, ChevronDown, FolderOpen, PlusCircle, Search } from '@lucide/svelte';

	let projectSwitcherOpen = $state(false);
	let projects = $state<{ id: string; name: string; path: string }[]>([]);

	$effect(() => {
		if (!projectSwitcherOpen) return;
		fetch('/api/projects')
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => (projects = list));
	});

	function openProject(proj: { id: string }) {
		goto(`/project/${proj.id}`);
		projectSwitcherOpen = false;
	}

	function openAllProjects() {
		goto('/');
		projectSwitcherOpen = false;
	}

	const brandHref = $derived(
		false ? `/?object=${encodeURIComponent(`demo-layout`)}` : '/'
	);
</script>

<div class="header-bar">
	<a href={brandHref} class="brand" aria-label="MCS — all projects" title="All projects">MCS</a>
	{#if $currentProject}
		<DropdownMenuRoot bind:open={projectSwitcherOpen}>
			<DropdownMenuTrigger class="project-switcher-trigger" aria-label="Switch project">
				<span class="project-name">{$currentProject.name}</span>
				<ChevronDown size={14} />
			</DropdownMenuTrigger>
			<DropdownMenuPortal>
				<DropdownMenuContent
					class="min-w-[12rem] max-w-[20rem] max-h-[320px] overflow-y-auto"
					side="bottom"
					align="start"
				>
					<DropdownMenuGroup>
						<DropdownMenuGroupHeading>Projects</DropdownMenuGroupHeading>
						{#each projects as proj}
							<DropdownMenuItem
								onSelect={() => openProject(proj)}
								class={proj.id === $currentProject?.id ? 'current' : ''}
							>
								<FolderOpen size={14} />
								<span class="proj-name">{proj.name}</span>
							</DropdownMenuItem>
						{/each}
					</DropdownMenuGroup>
					<DropdownMenuGroup>
						<DropdownMenuItem onSelect={openAllProjects}>
							<PlusCircle size={14} />
							Open all projects / Create project
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenuPortal>
		</DropdownMenuRoot>
	{/if}
	<div class="spacer"></div>
	<button
		class="icon-btn"
		type="button"
		aria-label="Open command palette"
		title="Command palette (Ctrl+K)"
		onclick={() => commandPaletteOpen.set(true)}
	>
		<Search size={18} />
	</button>
	<button
		class="icon-btn"
		type="button"
		aria-label="Settings"
		title="Settings"
		data-tutorial="settings-btn"
		onclick={() => settingsModalOpen.set(true)}
	>
		<Settings size={18} />
	</button>
	<button
		class="icon-btn"
		type="button"
		aria-label={$theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
		title={$theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
		onclick={() => theme.set($theme === 'light' ? 'dark' : 'light')}
	>
		{#if $theme === 'light'}
			<Moon size={18} />
		{:else}
			<Sun size={18} />
		{/if}
	</button>
</div>

<style>
	.header-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0 0.75rem;
		height: var(--mcs-header-height);
		background: var(--mcs-surface);
	}
	.brand {
		font-weight: 600;
		color: var(--mcs-text);
		text-decoration: none;
		flex-shrink: 0;
		border-radius: var(--mcs-radius);
		padding: 0.15rem 0.2rem;
		margin: -0.15rem -0.2rem;
	}
	.brand:hover {
		color: var(--mcs-accent);
	}
	.brand:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	:global(.project-switcher-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.5rem;
		background: transparent;
		border: 1px solid transparent;
		color: var(--mcs-text-muted);
		font-size: 0.9rem;
		font-family: inherit;
		cursor: pointer;
		border-radius: var(--mcs-radius);
	}
	:global(.project-switcher-trigger:hover) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	:global(.project-switcher-trigger:focus-visible) {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	:global(.project-switcher-trigger .project-name) {
		color: inherit;
	}
	:global(.project-switcher-trigger svg) {
		flex-shrink: 0;
	}
	:global(.proj-name) {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global([data-highlighted].current),
	:global(.current) {
		background: var(--mcs-surface-alt);
		font-weight: 500;
	}
	.spacer {
		flex: 1;
	}
	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		padding: 0;
		cursor: pointer;
		border-radius: var(--mcs-radius);
	}
	.icon-btn:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.icon-btn:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
</style>
