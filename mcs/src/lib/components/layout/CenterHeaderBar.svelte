<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		currentProject,
		selectedObject,
		invalidateSelectedObject,
		gridLayoutEditMode
	} from '$lib/stores/project';
	import { sidebarRightVisible } from '$lib/stores/sidebars';
	import { isGridLayoutType, isLayoutObjectType } from '$lib/objects/layout-kinds.js';
	import {
		Root as DropdownMenuRoot,
		Trigger as DropdownMenuTrigger,
		Content as DropdownMenuContent,
		Item as DropdownMenuItem,
		Portal as DropdownMenuPortal
	} from '$lib/components/ui/dropdown-menu';
	import { EllipsisVertical, Pencil, Check, Maximize, Minimize } from '@lucide/svelte';

	let menuOpen = $state(false);
	let headerName = $state('');
	let browserFullscreenSupported = $state(false);
	let browserFullscreenActive = $state(false);

	const title = $derived($selectedObject?.name ?? $currentProject?.name ?? 'Project root');
	const titleInputWidth = $derived(
		`${Math.max(4, Math.min(40, Math.ceil((headerName.trim() || title).length + 1.25)))}ch`
	);

	const canEditName = $derived(
		$selectedObject != null &&
			$selectedObject.type !== 'project' &&
			$selectedObject.type !== 'folder'
	);

	$effect(() => {
		const obj = $selectedObject;
		headerName = obj?.name ?? '';
	});

	$effect(() => {
		const _obj = $selectedObject;
		menuOpen = false;
	});

	function saveName() {
		const proj = $currentProject;
		const obj = $selectedObject;
		if (!proj || !obj || headerName.trim() === '' || headerName === obj.name) return;
		fetch(`/api/projects/${proj.id}/objects/${obj.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: headerName.trim(), expectedUpdatedAt: obj.updatedAt })
		}).then((r) => {
			if (r.ok || r.status === 409) invalidateSelectedObject();
		});
	}

	function handleNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			(e.target as HTMLInputElement).blur();
		}
	}

	function openProperties() {
		sidebarRightVisible.set(true);
		menuOpen = false;
	}

	function duplicateObject() {
		const proj = $currentProject;
		const obj = $selectedObject;
		if (!proj || !obj || obj.type === 'project') return;
		const parentId = (obj as { parentId?: string }).parentId ?? proj.id;
		fetch(`/api/projects/${proj.id}/objects`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				type: obj.type,
				parentId,
				name: (obj.name || 'Object') + ' copy',
				props: obj.props ?? {}
			})
		})
			.then((r) => (r.ok ? r.json() : null))
			.then((newObj: { id: string } | null) => {
				if (newObj) {
					goto(`/project/${proj.id}?object=${newObj.id}`);
					invalidateSelectedObject();
				}
			});
	}

	function removeObject() {
		const proj = $currentProject;
		const obj = $selectedObject;
		if (!proj || !obj || obj.type === 'project') return;
		fetch(`/api/projects/${proj.id}/objects/${obj.id}`, { method: 'DELETE' }).then((r) => {
			if (r.ok) {
				goto(`/project/${proj.id}`);
				invalidateSelectedObject();
			}
		});
		menuOpen = false;
	}

	function exportObject() {
		const obj = $selectedObject;
		if (!obj || obj.type === 'project') return;
		const payload = { name: obj.name, type: obj.type, props: obj.props ?? {} };
		const str = JSON.stringify(payload, null, 2);
		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(str);
		} else {
			const a = document.createElement('a');
			a.href = URL.createObjectURL(new Blob([str], { type: 'application/json' }));
			a.download = `${(obj.name || 'object').replace(/[^a-z0-9-_]/gi, '_')}.json`;
			a.click();
			URL.revokeObjectURL(a.href);
		}
		menuOpen = false;
	}

	const showObjectMenu = $derived($selectedObject != null && $selectedObject.type !== 'project');

	const isGridLayout = $derived(isGridLayoutType($selectedObject?.type));

	const isLayoutType = $derived(isLayoutObjectType($selectedObject?.type));

	function getFullscreenTarget(): HTMLElement | null {
		if (typeof document === 'undefined') return null;
		return document.querySelector<HTMLElement>('[data-layout-fullscreen-root]');
	}

	async function requestBrowserFullscreen(): Promise<boolean> {
		if (typeof document === 'undefined') return false;
		const target = getFullscreenTarget();
		if (!target) return false;

		try {
			if (document.fullscreenElement === target) return true;
			if (document.fullscreenElement && document.exitFullscreen) {
				await document.exitFullscreen();
			}
			if (typeof target.requestFullscreen === 'function') {
				await target.requestFullscreen();
				return true;
			}
			const legacyTarget = target as HTMLElement & {
				webkitRequestFullscreen?: () => Promise<void> | void;
			};
			if (typeof legacyTarget.webkitRequestFullscreen === 'function') {
				await legacyTarget.webkitRequestFullscreen();
				return true;
			}
		} catch (error) {
			console.warn('[CenterHeaderBar] Browser fullscreen request failed', error);
		}

		return false;
	}

	async function exitBrowserFullscreen(): Promise<void> {
		if (typeof document === 'undefined') return;
		try {
			if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
				await document.exitFullscreen();
				return;
			}
			const legacyDocument = document as Document & {
				webkitExitFullscreen?: () => Promise<void> | void;
			};
			if (typeof legacyDocument.webkitExitFullscreen === 'function') {
				await legacyDocument.webkitExitFullscreen();
			}
		} catch (error) {
			console.warn('[CenterHeaderBar] Browser fullscreen exit failed', error);
		}
	}

	async function toggleBrowserFullscreen(): Promise<void> {
		if (browserFullscreenActive) {
			await exitBrowserFullscreen();
			return;
		}
		await requestBrowserFullscreen();
	}

	$effect(() => {
		if (typeof document === 'undefined') return;

		browserFullscreenSupported =
			typeof document.documentElement.requestFullscreen === 'function' ||
			typeof (
				document.documentElement as HTMLElement & {
					webkitRequestFullscreen?: () => Promise<void> | void;
				}
			).webkitRequestFullscreen === 'function';

		const syncBrowserFullscreenState = () => {
			const target = getFullscreenTarget();
			const legacyDocument = document as Document & {
				webkitFullscreenElement?: Element | null;
			};
			const fullscreenElement =
				document.fullscreenElement ?? legacyDocument.webkitFullscreenElement ?? null;
			browserFullscreenActive = target != null ? fullscreenElement === target : fullscreenElement != null;
		};

		syncBrowserFullscreenState();
		document.addEventListener('fullscreenchange', syncBrowserFullscreenState);
		document.addEventListener(
			'webkitfullscreenchange',
			syncBrowserFullscreenState as EventListener
		);
		return () => {
			document.removeEventListener('fullscreenchange', syncBrowserFullscreenState);
			document.removeEventListener(
				'webkitfullscreenchange',
				syncBrowserFullscreenState as EventListener
			);
		};
	});

	$effect(() => {
		if ($selectedObject?.type !== 'grid-layout') {
			gridLayoutEditMode.set(false);
		}
	});

	function toggleGridEditMode() {
		gridLayoutEditMode.update((v) => !v);
	}
</script>

<div class="center-header-bar">
	{#if canEditName}
		<input
			class="center-title-input"
			type="text"
			bind:value={headerName}
			style:width={titleInputWidth}
			onblur={saveName}
			onkeydown={handleNameKeydown}
			aria-label="Object name"
		/>
	{:else}
		<h2 class="center-title">{title}</h2>
	{/if}
	<div class="center-header-actions">
		{#if isLayoutType}
			{#if browserFullscreenSupported}
				<button
					type="button"
					class="center-header-btn"
					aria-label={browserFullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
					title={browserFullscreenActive ? 'Exit fullscreen' : 'Fullscreen'}
					onclick={toggleBrowserFullscreen}
				>
					{#if browserFullscreenActive}
						<Minimize size={16} />
						<span class="btn-label">Exit fullscreen</span>
					{:else}
						<Maximize size={16} />
						<span class="btn-label">Fullscreen</span>
					{/if}
				</button>
			{/if}
		{/if}
		{#if isGridLayout}
			<button
				type="button"
				class="center-header-btn"
				aria-label={$gridLayoutEditMode ? 'Done editing' : 'Edit layout'}
				title={$gridLayoutEditMode ? 'Done editing' : 'Edit layout'}
				onclick={toggleGridEditMode}
			>
				{#if $gridLayoutEditMode}
					<Check size={16} />
					<span class="btn-label">Done</span>
				{:else}
					<Pencil size={16} />
					<span class="btn-label">Edit</span>
				{/if}
			</button>
		{/if}
		{#if showObjectMenu}
			<DropdownMenuRoot bind:open={menuOpen}>
				<DropdownMenuTrigger class="toggle-btn" aria-label="Object menu" title="Object menu">
					<EllipsisVertical size={16} />
				</DropdownMenuTrigger>
				<DropdownMenuPortal>
					<DropdownMenuContent class="min-w-[10rem]" side="bottom" align="end">
						<DropdownMenuItem onSelect={openProperties}>Open in Properties</DropdownMenuItem>
						<DropdownMenuItem onSelect={duplicateObject}>Duplicate</DropdownMenuItem>
						<DropdownMenuItem onSelect={removeObject}>Remove</DropdownMenuItem>
						<DropdownMenuItem onSelect={exportObject}>Export as JSON</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenuPortal>
			</DropdownMenuRoot>
		{/if}
	</div>
</div>

<style>
	.center-header-bar {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		height: var(--mcs-header-height);
		min-height: var(--mcs-header-height);
		flex-shrink: 0;
	}
	:global(.toggle-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
		border-radius: var(--mcs-radius);
	}
	:global(.toggle-btn:hover) {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	:global(.toggle-btn:focus-visible) {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.center-title,
	.center-title-input {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		font-family: var(--mcs-font-sans);
		color: var(--mcs-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.center-title {
		flex: 1;
		min-width: 0;
	}
	.center-title-input {
		flex: 0 1 auto;
		min-width: 0;
		max-width: min(100%, 40ch);
		background: transparent;
		border: 1px solid transparent;
		padding: 0.12rem 0.05rem 0.12rem 0;
		border-radius: 0;
	}
	.center-title-input:focus {
		outline: none;
		border-bottom-color: var(--mcs-border);
	}
	.center-header-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: auto;
	}
	.center-header-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.5rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		font-size: 0.8rem;
		font-family: var(--mcs-font-sans);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.center-header-btn:hover {
		background: var(--mcs-border);
	}
	.center-header-btn .btn-label {
		white-space: nowrap;
	}
	@media (max-width: 768px) {
		.center-header-bar {
			gap: 0.35rem;
		}
	}
</style>
