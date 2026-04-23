<script lang="ts">
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { theme } from '$lib/stores/theme';
	import { settingsModalOpen, addObjectModalOpen } from '$lib/stores/settings';
	import { sidebarLeftVisible, sidebarRightVisible } from '$lib/stores/sidebars';
	import { commandPaletteOpen } from '$lib/stores/commandPalette';
	import { selectedObject, selectedObjectId, gridLayoutEditMode } from '$lib/stores/project';
	import { explorerTree } from '$lib/stores/explorerTree';
	import { isGridLayoutType } from '$lib/objects/layout-kinds.js';
	import { getType } from '$lib/object-types/registry.js';
	import type { ObjectTreeNode } from '$lib/objects/types.js';
	import {
		Sun,
		Moon,
		Settings,
		PanelLeftClose,
		PanelRightClose,
		FolderOpen,
		Search,
		Plus,
		Pencil,
		ArrowRight
	} from '@lucide/svelte';

	type PaletteItem = {
		id: string;
		label: string;
		keywords: string[];
		icon: any; // Type workaround for Lucide Svelte components
		category: 'command' | 'object';
		description?: string;
		run: () => void;
	};

	const SHORTCUT_HINT =
		typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac')
			? '⌘K'
			: 'Ctrl+K';

	let query = $state('');
	let selectedIndex = $state(0);
	let inputEl = $state<HTMLInputElement | undefined>(undefined);

	/** Flatten the object tree into a searchable list */
	function flattenTree(node: ObjectTreeNode | null): { id: string; name: string; type: string }[] {
		if (!node) return [];
		const result: { id: string; name: string; type: string }[] = [];
		function walk(n: ObjectTreeNode) {
			if (n.type !== 'project') {
				result.push({ id: n.id, name: n.name, type: n.type });
			}
			for (const c of n.children ?? []) walk(c);
		}
		walk(node);
		return result;
	}

	const objectList = $derived(flattenTree($explorerTree));

	const commands = $derived.by(() => {
		const t = $theme;
		const sel = $selectedObject;
		const isGrid = isGridLayoutType(sel?.type);
		const gridEditing = get(gridLayoutEditMode);
		const list: PaletteItem[] = [
			{
				id: 'theme',
				label: t === 'light' ? 'Switch to dark mode' : 'Switch to light mode',
				keywords: ['theme', 'dark', 'light', 'appearance'],
				icon: t === 'light' ? Moon : Sun,
				category: 'command',
				run: () => theme.set(t === 'light' ? 'dark' : 'light')
			},
			{
				id: 'settings',
				label: 'Open Settings',
				keywords: ['settings', 'preferences'],
				icon: Settings,
				category: 'command',
				run: () => settingsModalOpen.set(true)
			},
			{
				id: 'sidebar-left',
				label: 'Toggle Explorer',
				keywords: ['sidebar', 'left', 'panel', 'explorer'],
				icon: PanelLeftClose,
				category: 'command',
				run: () => sidebarLeftVisible.update((v) => !v)
			},
			{
				id: 'sidebar-right',
				label: 'Toggle Properties',
				keywords: ['sidebar', 'right', 'panel', 'properties'],
				icon: PanelRightClose,
				category: 'command',
				run: () => sidebarRightVisible.update((v) => !v)
			},
			{
				id: 'project-picker',
				label: 'Go to project picker',
				keywords: ['project', 'picker', 'create', 'open', 'switch', 'home'],
				icon: FolderOpen,
				category: 'command',
				run: () => goto('/')
			},
			{
				id: 'new-object',
				label: 'New object…',
				keywords: ['new', 'add', 'object', 'create'],
				icon: Plus,
				category: 'command',
				run: () => addObjectModalOpen.set(true)
			}
		];
		if (isGrid) {
			list.push({
				id: 'grid-edit',
				label: gridEditing ? 'Exit grid edit mode' : 'Toggle grid edit mode',
				keywords: ['grid', 'layout', 'edit', 'widget'],
				icon: Pencil,
				category: 'command',
				run: () => gridLayoutEditMode.update((v) => !v)
			});
		}
		return list;
	});

	/** Build object items lazily when needed */
	function getObjectItems(): PaletteItem[] {
		return objectList.map((o) => {
			const info = getType(o.type);
			return {
				id: `obj:${o.id}`,
				label: o.name,
				keywords: [o.type, o.name.toLowerCase()],
				icon: info?.icon ?? ArrowRight,
				category: 'object' as const,
				description: info?.label ?? o.type,
				run: () => selectedObjectId.set(o.id)
			};
		});
	}

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q === '') return commands;
		const matchedCommands = commands.filter(
			(c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q))
		);
		const matchedObjects = getObjectItems().filter(
			(o) => o.label.toLowerCase().includes(q) || o.keywords.some((k) => k.includes(q))
		);
		return [...matchedCommands, ...matchedObjects].slice(0, 20);
	});

	$effect(() => {
		selectedIndex = Math.min(Math.max(0, selectedIndex), Math.max(0, filtered.length - 1));
	});

	function close() {
		commandPaletteOpen.set(false);
		query = '';
		selectedIndex = 0;
	}

	function runItem(item: PaletteItem) {
		item.run();
		close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!get(commandPaletteOpen)) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const item = filtered[selectedIndex];
			if (item) runItem(item);
			return;
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			if (get(settingsModalOpen) || get(addObjectModalOpen)) return;
			e.preventDefault();
			commandPaletteOpen.update((v) => !v);
			query = '';
			selectedIndex = 0;
		}
	}

	function handleOverlayClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('command-palette-overlay')) close();
	}

	$effect(() => {
		const unsub = commandPaletteOpen.subscribe((open) => {
			if (open) setTimeout(() => inputEl?.focus(), 50);
		});
		return unsub;
	});

	/** Track category transitions for headers */
	function showCategoryHeader(items: PaletteItem[], i: number): string | null {
		if (i === 0) return items[i].category === 'command' ? 'Commands' : 'Objects';
		if (items[i].category !== items[i - 1].category) {
			return items[i].category === 'command' ? 'Commands' : 'Objects';
		}
		return null;
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if $commandPaletteOpen}
	<div
		class="command-palette-overlay"
		role="presentation"
		onclick={handleOverlayClick}
		onkeydown={handleKeydown}
	>
		<div class="command-palette" role="dialog" aria-label="Command palette">
			<div class="search-row">
				<Search size={18} />
				<input
					bind:value={query}
					bind:this={inputEl}
					type="text"
					placeholder="Search commands... ({SHORTCUT_HINT})"
					aria-label="Search commands"
					class="search-input"
				/>
			</div>
			<ul class="command-list" role="listbox">
				{#each filtered as item, i}
					{@const Icon = item.icon}
					{@const header = showCategoryHeader(filtered, i)}
					{#if header}
						<li class="category-header" role="separator">{header}</li>
					{/if}
					<li>
						<button
							type="button"
							role="option"
							aria-selected={i === selectedIndex}
							class:selected={i === selectedIndex}
							onclick={() => runItem(item)}
							onmouseenter={() => (selectedIndex = i)}
						>
							<Icon size={16} />
							<span class="item-label">{item.label}</span>
							{#if item.description}
								<span class="item-desc">{item.description}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
			{#if filtered.length === 0}
				<p class="no-results">No matching commands or objects</p>
			{/if}
			<div class="command-palette-footer">
				{SHORTCUT_HINT} to open · Type to search objects · Esc to close
			</div>
		</div>
	</div>
{/if}

<style>
	.command-palette-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 15vh;
		z-index: 3000;
	}
	.command-palette {
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: 8px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
		width: var(--mcs-modal-width);
		min-width: var(--mcs-modal-width);
		max-width: min(var(--mcs-modal-width), 90vw);
		min-height: var(--mcs-modal-min-height);
		max-height: var(--mcs-modal-max-height);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.search-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	.search-row :global(svg) {
		flex-shrink: 0;
		color: var(--mcs-text-muted);
	}
	.search-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		color: var(--mcs-text);
		font-size: 0.95rem;
		font-family: inherit;
		outline: none;
	}
	.search-input::placeholder {
		color: var(--mcs-text-muted);
	}
	.command-list {
		list-style: none;
		margin: 0;
		padding: 0.5rem 0;
		overflow-y: auto;
		max-height: 50vh;
	}
	.command-list li {
		margin: 0;
	}
	.command-list button {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 1rem;
		text-align: left;
		background: transparent;
		border: none;
		color: var(--mcs-text);
		font-size: 0.9rem;
		font-family: inherit;
		cursor: pointer;
	}
	.command-list button:hover,
	.command-list button.selected {
		background: var(--mcs-surface-alt);
	}
	.command-list button :global(svg) {
		flex-shrink: 0;
		color: var(--mcs-text-muted);
	}
	.no-results {
		padding: 0.75rem 1rem;
		margin: 0;
		font-size: 0.875rem;
		color: var(--mcs-text-muted);
	}
	.category-header {
		padding: 0.35rem 1rem 0.2rem;
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--mcs-text-muted);
		list-style: none;
	}
	.item-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-desc {
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		opacity: 0.7;
	}
	.command-palette-footer {
		padding: 0.35rem 1rem;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		border-top: 1px solid var(--mcs-border);
	}
</style>
