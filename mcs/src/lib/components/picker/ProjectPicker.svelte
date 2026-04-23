<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		Root as DropdownMenuRoot,
		Trigger as DropdownMenuTrigger,
		Content as DropdownMenuContent,
		Item as DropdownMenuItem,
		Separator as DropdownMenuSeparator,
		Portal as DropdownMenuPortal
	} from '$lib/components/ui/dropdown-menu';
	import {
		FolderOpen,
		PlusCircle,
		ChevronRight,
		MoreVertical,
		Pencil,
		Trash2,
		X,
		ListMinus,
		Copy,
		Leaf,
		Cpu,
		ChevronDown,
		Sun,
		Moon
	} from '@lucide/svelte';
	import { theme } from '$lib/stores/theme';

	type Proj = { path: string; id: string; name: string };

	let projects = $state<Proj[]>([]);
	let loading = $state(true);
	let refreshTrigger = $state(0);
	let createName = $state('');
	let createPath = $state('');
	let creating = $state(false);
	let createError = $state<string | null>(null);
	let nameInvalid = $state(false);

	let editProj = $state<Proj | null>(null);
	let editName = $state('');
	let editSaving = $state(false);
	let editError = $state<string | null>(null);
	let editNameInvalid = $state(false);

	let deleteConfirmProj = $state<Proj | null>(null);
	let deleteDeleting = $state(false);
	let deleteError = $state<string | null>(null);

	let bulkMode = $state(false);
	let selectedIds = $state<Set<string>>(new Set());
	let bulkDeleteOpen = $state(false);
	let bulkDeleteRunning = $state(false);
	let bulkDeleteError = $state<string | null>(null);
	let bulkDeleteAck = $state(false);
	let bulkDeleteTyped = $state('');

	let copyToast = $state<string | null>(null);
	let copyToastTimer: ReturnType<typeof setTimeout> | null = null;

	let templateCreating = $state(false);
	let templateError = $state<string | null>(null);
	let examplesOpen = $state(false);

	$effect(() => {
		refreshTrigger;
		loading = true;
		if (false) {
			projects = [];
			loading = false;
			return;
		}
		fetch('/api/projects')
			.then((r) => (r.ok ? r.json() : []))
			.then((list) => (projects = list))
			.finally(() => (loading = false));
	});

	$effect(() => {
		if (editProj) {
			editName = editProj.name;
			editError = null;
			editNameInvalid = false;
		}
	});

	function refreshProjects() {
		refreshTrigger++;
	}

	function openProject(proj: Proj) {
		goto(`/project/${proj.id}`);
	}

	function openEdit(proj: Proj) {
		editProj = proj;
	}

	function closeEdit() {
		editProj = null;
		editError = null;
	}

	function saveEdit() {
		if (!editProj) return;
		if (!editName.trim()) {
			editNameInvalid = true;
			return;
		}
		editNameInvalid = false;
		editSaving = true;
		editError = null;
		fetch(`/api/projects/${editProj.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: editName.trim() })
		})
			.then((r) =>
				r.ok
					? undefined
					: r.json().then((d) => Promise.reject(new Error(d?.error ?? 'Failed to update')))
			)
			.then(() => {
				closeEdit();
				refreshProjects();
			})
			.catch((e) => (editError = e.message ?? 'Failed to update'))
			.finally(() => (editSaving = false));
	}

	function removeFromList(proj: Proj) {
		fetch(`/api/projects/${proj.id}`, { method: 'DELETE' }).then((r) => {
			if (r.ok || r.status === 404) {
				refreshProjects();
			}
		});
	}

	function openDeleteConfirm(proj: Proj) {
		deleteConfirmProj = proj;
		deleteError = null;
	}

	function closeDeleteConfirm() {
		deleteConfirmProj = null;
		deleteError = null;
	}

	function confirmDelete() {
		if (!deleteConfirmProj) return;
		deleteDeleting = true;
		deleteError = null;
		fetch(`/api/projects/${deleteConfirmProj.id}`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ deleteFolder: true })
		})
			.then((r) => {
				if (r.ok || r.status === 404) {
					closeDeleteConfirm();
					refreshProjects();
				} else
					return r.json().then((d) => Promise.reject(new Error(d?.error ?? 'Failed to delete')));
			})
			.catch((e) => (deleteError = e.message ?? 'Failed to delete'))
			.finally(() => (deleteDeleting = false));
	}

	function handleEditOverlayClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('modal-overlay')) closeEdit();
	}

	function handleDeleteOverlayClick(e: MouseEvent) {
		if (!deleteDeleting && (e.target as HTMLElement).classList.contains('modal-overlay'))
			closeDeleteConfirm();
	}

	function getDefaultProjectName(): string {
		const baseName = 'Untitled Project';
		const untitledPattern = /^Untitled Project(?: (\d+))?$/;
		const usedNumbers = new Set<number>();

		for (const proj of projects) {
			const match = proj.name.match(untitledPattern);
			if (match) {
				const num = match[1] ? parseInt(match[1], 10) : 0;
				usedNumbers.add(num);
			}
		}

		if (usedNumbers.size === 0) {
			return baseName;
		}

		let nextNum = 1;
		while (usedNumbers.has(nextNum)) {
			nextNum++;
		}

		return `${baseName} ${nextNum}`;
	}

	function createProject() {
		if (false) return;
		const projectName = createName.trim() || getDefaultProjectName();
		nameInvalid = false;
		creating = true;
		createError = null;
		fetch('/api/projects', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: projectName,
				path: createPath.trim() || undefined
			})
		})
			.then((r) =>
				r
					.json()
					.then((data) =>
						r.ok ? data : Promise.reject(new Error(data?.error ?? 'Failed to create project'))
					)
			)
			.then((proj) => goto(`/project/${proj.id}`))
			.catch((e) => (createError = e.message ?? 'Failed to create project'))
			.finally(() => (creating = false));
	}

	type TemplateKind = 'ndvi' | 'system';

	async function createFromTemplate(kind: TemplateKind) {
		if (false) return;
		templateCreating = true;
		templateError = null;
		const ts = Date.now();
		const configs: Record<TemplateKind, { name: string; auto: string[]; slug: string }> = {
			ndvi: { name: 'Agriculture', auto: ['agri-ndvi-mission'], slug: 'ndvi' },
			system: { name: 'System Monitor', auto: ['system-sensor'], slug: 'system' }
		};
		const c = configs[kind];
		const path = `./data/projects/template-${c.slug}-${ts}`;
		try {
			const res = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: c.name, path })
			});
			const data = await res.json();
			if (!res.ok)
				throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to create project');
			const settings: { tutorialExampleKind: TemplateKind; autoStartPlugins?: string[] } = {
				tutorialExampleKind: kind
			};
			if (c.auto.length > 0) settings.autoStartPlugins = c.auto;
			const patchRes = await fetch(`/api/projects/${data.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ settings })
			});
			const patchData = await patchRes.json().catch(() => ({}));
			if (!patchRes.ok) {
				throw new Error(
					typeof patchData?.error === 'string' ? patchData.error : 'Failed to save example settings'
				);
			}
			await goto(`/project/${data.id}?startTour=1`);
		} catch (e) {
			templateError = e instanceof Error ? e.message : 'Failed to create from template';
		} finally {
			templateCreating = false;
		}
	}

	function showCopyToast(message: string) {
		if (copyToastTimer) clearTimeout(copyToastTimer);
		copyToast = message;
		copyToastTimer = setTimeout(() => {
			copyToast = null;
			copyToastTimer = null;
		}, 2000);
	}

	async function copyProjectPath(proj: Proj) {
		try {
			await navigator.clipboard.writeText(proj.path);
			showCopyToast('Path copied');
		} catch {
			showCopyToast('Could not copy');
		}
	}

	function toggleSelectId(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function selectAllProjects() {
		selectedIds = new Set(projects.map((p) => p.id));
	}

	function clearBulkSelection() {
		selectedIds = new Set();
	}

	function exitBulkMode() {
		bulkMode = false;
		selectedIds = new Set();
	}

	function selectedProjects(): Proj[] {
		return projects.filter((p) => selectedIds.has(p.id));
	}

	function openBulkDelete() {
		if (selectedIds.size === 0) return;
		bulkDeleteError = null;
		bulkDeleteAck = false;
		bulkDeleteTyped = '';
		bulkDeleteOpen = true;
	}

	function closeBulkDelete() {
		if (bulkDeleteRunning) return;
		bulkDeleteOpen = false;
		bulkDeleteError = null;
		bulkDeleteAck = false;
		bulkDeleteTyped = '';
	}

	async function confirmBulkDeleteFolders() {
		const ids = [...selectedIds];
		if (ids.length === 0 || bulkDeleteTyped !== 'DELETE' || !bulkDeleteAck) return;
		bulkDeleteRunning = true;
		bulkDeleteError = null;
		let closeOnSuccess = false;
		try {
			const res = await fetch('/api/projects/batch-delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids, deleteFolder: true })
			});
			const data = (await res.json()) as {
				results?: { id: string; ok: boolean; error?: string }[];
				error?: string;
			};
			if (!data.results) {
				bulkDeleteError = data.error ?? 'Request failed';
				return;
			}
			const failed = data.results.filter((r) => !r.ok);
			if (failed.length > 0) {
				bulkDeleteError = failed.map((f) => `${f.id}: ${f.error ?? 'error'}`).join('; ');
			}
			refreshProjects();
			clearBulkSelection();
			if (failed.length === 0) {
				exitBulkMode();
				closeOnSuccess = true;
			}
		} catch (e) {
			bulkDeleteError = e instanceof Error ? e.message : 'Request failed';
		} finally {
			bulkDeleteRunning = false;
			if (closeOnSuccess) closeBulkDelete();
		}
	}

	function handleBulkDeleteOverlay(e: MouseEvent) {
		if (!bulkDeleteRunning && (e.target as HTMLElement).classList.contains('modal-overlay'))
			closeBulkDelete();
	}
</script>

<div class="page">
	{#if copyToast}
		<div class="copy-toast" role="status">{copyToast}</div>
	{/if}
	<div class="picker">
		<header class="picker-header">
			<div class="picker-header-row">
				<div class="picker-title-block">
					<h1>Projects</h1>
				</div>
				<button
					type="button"
					class="icon-btn"
					aria-label={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
					title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
					onclick={() => theme.set($theme === 'dark' ? 'light' : 'dark')}
				>
					{#if $theme === 'dark'}
						<Sun size={18} />
					{:else}
						<Moon size={18} />
					{/if}
				</button>
				<a href="/gallery" class="gallery-link" title="Component showcase for developers">Gallery</a
				>
			</div>
		</header>

		<div class="picker-columns">
			<section class="section section-open">
				<h2><FolderOpen size={16} /> Open project</h2>
				{#if !loading && projects.length > 0}
					<div class="open-section-toolbar">
						{#if !bulkMode}
							<button type="button" class="btn-toolbar" onclick={() => (bulkMode = true)}
								>Select</button
							>
						{:else}
							<button type="button" class="btn-toolbar" onclick={selectAllProjects}
								>Select all</button
							>
							<button
								type="button"
								class="btn-toolbar btn-toolbar-danger"
								disabled={selectedIds.size === 0}
								onclick={() => openBulkDelete()}
							>
								Delete
							</button>
							<button type="button" class="btn-toolbar" onclick={exitBulkMode}>Done</button>
						{/if}
					</div>
				{/if}
				<div class="section-body">
					{#if loading}
						<p class="muted">Loading...</p>
					{:else if projects.length === 0}
						<p class="muted">No recent projects. Create one on the right.</p>
					{:else}
						<div class="project-list-scroll">
							<ul class="project-list">
								{#each projects as proj}
									<li class="project-card">
										{#if bulkMode}
											<label
												class="project-card-main bulk-select"
												aria-label={`Select ${proj.name}`}
												title={proj.path ? proj.path : undefined}
											>
												<input
													type="checkbox"
													checked={selectedIds.has(proj.id)}
													onchange={() => toggleSelectId(proj.id)}
												/>
												<span class="proj-name">{proj.name}</span>
											</label>
										{:else}
											<button
												type="button"
												class="project-card-main"
												onclick={() => openProject(proj)}
												aria-label={proj.name}
												title={proj.path ? proj.path : undefined}
											>
												<span class="proj-name">{proj.name}</span>
												<span class="chevron"><ChevronRight size={16} /></span>
											</button>
										{/if}
										<div class="project-card-actions">
											<DropdownMenuRoot>
												<DropdownMenuTrigger
													class="menu-trigger"
													aria-label="Project menu"
													title="Project menu"
												>
													<MoreVertical size={16} />
												</DropdownMenuTrigger>
												<DropdownMenuPortal>
													<DropdownMenuContent side="bottom" align="end" class="min-w-[10rem]">
														{#if proj.path}
															<DropdownMenuItem onSelect={() => copyProjectPath(proj)}>
																<Copy size={14} />
																Copy path
															</DropdownMenuItem>
															<DropdownMenuSeparator />
														{/if}
														<DropdownMenuItem onSelect={() => openEdit(proj)}>
															<Pencil size={14} />
															Edit
														</DropdownMenuItem>
														<DropdownMenuItem onSelect={() => removeFromList(proj)}>
															<ListMinus size={14} />
															Remove from list
														</DropdownMenuItem>
														<DropdownMenuItem onSelect={() => openDeleteConfirm(proj)}>
															<Trash2 size={14} />
															Delete project
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenuPortal>
											</DropdownMenuRoot>
										</div>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>
			</section>

			{#if !false}
				<section class="section section-create">
					<h2><PlusCircle size={16} /> Create project</h2>
					<div class="section-body">
						{#if templateError}<p class="error-msg">{templateError}</p>{/if}
						{#if createError}<p class="error-msg">{createError}</p>{/if}
						<form
							novalidate
							onsubmit={(e) => {
								e.preventDefault();
								createProject();
							}}
						>
							<label>
								Name
								<input
									type="text"
									bind:value={createName}
									placeholder="My project"
									class:input-error={nameInvalid}
									oninput={() => {
										createError = null;
										nameInvalid = false;
									}}
								/>
							</label>
							<label>
								Path (optional)
								<input
									type="text"
									bind:value={createPath}
									placeholder="Leave empty for default"
									oninput={() => (createError = null)}
								/>
							</label>
							<button type="submit" class="btn-primary" disabled={creating || templateCreating}
								>Create</button
							>
						</form>
						<div class="examples-block">
							<button
								type="button"
								class="examples-toggle"
								aria-expanded={examplesOpen}
								aria-controls="example-projects-panel"
								id="example-projects-toggle"
								disabled={templateCreating}
								onclick={() => (examplesOpen = !examplesOpen)}
							>
								<span>Example projects</span>
								<span class="examples-chevron" class:open={examplesOpen} aria-hidden="true"
									><ChevronDown size={16} /></span
								>
							</button>
							{#if examplesOpen}
								<div
									class="examples-panel"
									id="example-projects-panel"
									role="region"
									aria-labelledby="example-projects-toggle"
								>
									<ul class="examples-list">
										<li>
											<button
												type="button"
												class="example-row"
												disabled={templateCreating}
												onclick={() => createFromTemplate('ndvi')}
											>
												<span class="example-row-icon" aria-hidden="true"
													><Leaf size={18} /></span
												>
												<span class="example-row-text">
													<span class="example-title">Agriculture</span>
													<span class="example-desc"
														>NDVI maps, survey progress, canopy sensing, and field notes.</span
													>
												</span>
											</button>
										</li>
										<li>
											<button
												type="button"
												class="example-row"
												disabled={templateCreating}
												onclick={() => createFromTemplate('system')}
											>
												<span class="example-row-icon" aria-hidden="true"><Cpu size={18} /></span>
												<span class="example-row-text">
													<span class="example-title">System Monitor</span>
													<span class="example-desc"
														>CPU, memory, disk, and host location with a live workspace.</span
													>
												</span>
											</button>
										</li>
									</ul>
								</div>
							{/if}
						</div>
					</div>
				</section>
			{/if}
		</div>

		{#if editProj}
			<div class="modal-overlay" onclick={handleEditOverlayClick} role="presentation">
				<div class="modal edit-modal" role="dialog" aria-labelledby="edit-project-title">
					<div class="modal-header">
						<h2 id="edit-project-title">Edit project</h2>
						<button
							type="button"
							class="close-btn"
							aria-label="Close"
							title="Close"
							onclick={closeEdit}
						>
							<X size={18} />
						</button>
					</div>
					<div class="modal-body">
						{#if editError}<p class="error-msg">{editError}</p>{/if}
						<label class="label-required">
							Name *
							<input
								type="text"
								bind:value={editName}
								placeholder="Project name"
								class:input-error={editNameInvalid}
								oninput={() => {
									editError = null;
									editNameInvalid = false;
								}}
							/>
						</label>
						<label>
							Path
							<input type="text" value={editProj.path} readonly disabled class="path-readonly" />
						</label>
						<div class="modal-actions">
							<button
								type="button"
								class="btn-secondary"
								onclick={() => {
									if (editProj) removeFromList(editProj);
									closeEdit();
								}}
							>
								<ListMinus size={14} />
								Remove from list
							</button>
							<span class="spacer"></span>
							<button type="button" class="btn-secondary" onclick={closeEdit}>Cancel</button>
							<button
								type="button"
								class="btn-primary"
								disabled={editSaving || !editName.trim()}
								onclick={saveEdit}
							>
								{editSaving ? 'Saving...' : 'Save'}
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if deleteConfirmProj}
			<div class="modal-overlay" onclick={handleDeleteOverlayClick} role="presentation">
				<div class="modal confirm-modal" role="alertdialog" aria-labelledby="delete-confirm-title">
					<div class="modal-header">
						<h2 id="delete-confirm-title">Delete project</h2>
						<button
							type="button"
							class="close-btn"
							aria-label="Close"
							title="Close"
							disabled={deleteDeleting}
							onclick={closeDeleteConfirm}
						>
							<X size={18} />
						</button>
					</div>
					<div class="modal-body">
						{#if deleteError}<p class="error-msg">{deleteError}</p>{/if}
						<p class="confirm-text">
							Delete project <strong>{deleteConfirmProj.name}</strong>? This will remove it from the
							list and permanently delete the project folder and all data.
						</p>
						<div class="modal-actions">
							<button
								type="button"
								class="btn-secondary"
								disabled={deleteDeleting}
								onclick={closeDeleteConfirm}
							>
								Cancel
							</button>
							<button
								type="button"
								class="btn-danger"
								disabled={deleteDeleting}
								onclick={confirmDelete}
							>
								{deleteDeleting ? 'Deleting...' : 'Delete'}
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}

		{#if bulkDeleteOpen}
			<div class="modal-overlay" onclick={handleBulkDeleteOverlay} role="presentation">
				<div class="modal confirm-modal" role="alertdialog" aria-labelledby="bulk-del-title">
					<div class="modal-header">
						<h2 id="bulk-del-title">Delete project folders</h2>
						<button
							type="button"
							class="close-btn"
							aria-label="Close"
							title="Close"
							disabled={bulkDeleteRunning}
							onclick={closeBulkDelete}
						>
							<X size={18} />
						</button>
					</div>
					<div class="modal-body">
						{#if bulkDeleteError}<p class="error-msg">{bulkDeleteError}</p>{/if}
						<p class="confirm-text danger-lead">
							Permanently delete <strong>{selectedProjects().length}</strong> project folder(s) and all
							data. This cannot be undone.
						</p>
						<ul class="bulk-name-list">
							{#each selectedProjects() as p}
								<li>{p.name}</li>
							{/each}
						</ul>
						<label class="bulk-ack">
							<input type="checkbox" bind:checked={bulkDeleteAck} />
							<span class="bulk-ack-text"
								>I understand these folders will be deleted from disk.</span
							>
						</label>
						<label class="bulk-type-label">
							Type <strong>DELETE</strong> to confirm
							<input
								type="text"
								class="bulk-type-input"
								bind:value={bulkDeleteTyped}
								autocomplete="off"
								aria-label="Type DELETE to confirm"
							/>
						</label>
						<div class="modal-actions">
							<button
								type="button"
								class="btn-secondary"
								disabled={bulkDeleteRunning}
								onclick={closeBulkDelete}>Cancel</button
							>
							<button
								type="button"
								class="btn-danger"
								disabled={bulkDeleteRunning || !bulkDeleteAck || bulkDeleteTyped !== 'DELETE'}
								onclick={confirmBulkDeleteFolders}
							>
								{bulkDeleteRunning ? 'Deleting…' : 'Delete folders'}
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		position: relative;
	}
	.copy-toast {
		position: fixed;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 1rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		font-size: 0.8125rem;
		color: var(--mcs-text);
		z-index: 1100;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
	}
	.picker {
		max-width: 800px;
		width: 100%;
		max-height: min(92vh, 44rem);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		align-self: center;
	}
	.picker-header {
		margin-bottom: 0.75rem;
		flex-shrink: 0;
	}
	.examples-block {
		margin-top: 0.85rem;
	}
	.examples-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		cursor: pointer;
		text-align: left;
	}
	.examples-toggle:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.examples-toggle:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
		border-radius: 0;
	}
	.examples-chevron {
		display: inline-flex;
		flex-shrink: 0;
		transition: transform 0.15s ease;
		color: var(--mcs-text-muted);
	}
	.examples-chevron.open {
		transform: rotate(180deg);
	}
	.examples-panel {
		margin-top: 0.65rem;
	}
	.examples-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.example-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.55rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-bg);
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		color: var(--mcs-text);
	}
	.example-row:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.example-row:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
	}
	.example-row-icon {
		flex-shrink: 0;
		color: var(--mcs-text-muted);
		margin-top: 0.1rem;
	}
	.example-row-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.example-title {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--mcs-text);
	}
	.example-desc {
		font-size: 0.75rem;
		line-height: 1.35;
		color: var(--mcs-text-muted);
	}
	.picker-header-row {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.picker-header-row .icon-btn {
		position: absolute;
		top: 0;
		right: 0;
		margin-left: 0;
	}
	.picker-header {
		position: relative;
	}
	.icon-btn {
		margin-left: auto;
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
	.picker-title-block {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.picker h1 {
		font-size: 1.35rem;
		font-weight: 600;
		margin: 0;
		color: var(--mcs-text);
	}
	.gallery-link {
		font-size: 0.875rem;
		color: var(--mcs-text-muted);
		text-decoration: none;
		margin-left: 0;
	}
	.gallery-link:hover {
		color: var(--mcs-accent);
	}
	.picker-columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		align-items: stretch;
		align-content: stretch;
		min-height: 0;
		flex: 1;
	}
	@media (min-width: 561px) {
		.picker-columns {
			grid-template-rows: minmax(0, 1fr);
		}
	}
	@media (max-width: 560px) {
		.picker-columns {
			grid-template-columns: 1fr;
		}
		.picker {
			max-height: none;
			overflow: visible;
		}
	}
	.section {
		display: flex;
		flex-direction: column;
		min-height: 0;
		align-self: stretch;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin-bottom: 0.75rem;
	}
	.section:last-child {
		margin-bottom: 0;
	}
	.picker-columns .section {
		margin-bottom: 0;
	}
	.picker-columns .section-open:has(.project-list-scroll) {
		padding-bottom: 0;
	}
	.section h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		margin: 0 0 0.5rem;
		flex-shrink: 0;
	}
	.open-section-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem 0.5rem;
		margin-bottom: 0.5rem;
		flex-shrink: 0;
	}
	.btn-toolbar {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		border: 1px solid var(--mcs-border);
		background: var(--mcs-bg);
		color: var(--mcs-text-muted);
		cursor: pointer;
		font-family: inherit;
	}
	.btn-toolbar:hover {
		color: var(--mcs-text);
		background: var(--mcs-surface-alt);
	}
	.btn-toolbar-danger {
		color: var(--mcs-accent);
		border-color: var(--mcs-accent);
	}
	.btn-toolbar:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.section-body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.project-list-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		border-radius: 4px;
		box-sizing: border-box;
		padding-bottom: 1.25rem;
	}
	@media (max-width: 560px) {
		.project-list-scroll {
			flex: 0 1 auto;
			max-height: min(40vh, 16rem);
		}
	}
	.project-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.project-card {
		display: flex;
		align-items: stretch;
		background: var(--mcs-bg);
		border: 1px solid var(--mcs-border);
		border-radius: 6px;
		min-height: 2.5rem;
		position: relative;
	}
	.project-card-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		text-align: left;
		background: none;
		border: none;
		color: var(--mcs-text);
		font-size: 0.875rem;
		cursor: pointer;
		font-family: inherit;
		border-radius: 5px 0 0 5px;
	}
	.project-card-main.bulk-select {
		user-select: none;
		border-radius: 5px 0 0 5px;
	}
	.project-card-main.bulk-select input {
		margin: 0;
		accent-color: var(--mcs-accent);
		flex-shrink: 0;
	}
	.project-card-main:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: -2px;
	}
	.project-card-main .chevron {
		flex-shrink: 0;
		margin-left: auto;
		color: var(--mcs-text-muted);
		opacity: 0.7;
	}
	.project-card-actions {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		border-left: 1px solid var(--mcs-border);
		border-radius: 0 5px 5px 0;
	}
	:global(.menu-trigger) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 100%;
		min-height: 2.5rem;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
	}
	:global(.menu-trigger:hover) {
		color: var(--mcs-text);
		background: var(--mcs-surface-alt);
	}
	.proj-name {
		flex: 1;
		min-width: 0;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.muted {
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		margin: 0;
	}
	.error-msg {
		font-size: 0.8125rem;
		color: var(--mcs-accent);
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		border-radius: 4px;
	}
	.bulk-name-list {
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		max-height: 10rem;
		overflow-y: auto;
		background: transparent;
		border: 1px solid var(--mcs-border);
		border-radius: 6px;
		font-size: 0.8125rem;
		color: var(--mcs-text);
		list-style: none;
	}
	.bulk-name-list li {
		padding: 0.15rem 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.danger-lead {
		color: var(--mcs-text);
	}
	.bulk-ack {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		margin-bottom: 0.75rem;
		cursor: pointer;
	}
	.bulk-ack input {
		margin: 0;
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
		accent-color: var(--mcs-accent);
	}
	.bulk-ack-text {
		line-height: 1.4;
	}
	.bulk-type-label {
		display: block;
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		margin-bottom: 0.75rem;
	}
	.bulk-type-input {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin-top: 0.35rem;
		padding: 0.5rem 0.65rem;
		background: var(--mcs-bg);
		border: 1px solid var(--mcs-border);
		border-radius: 6px;
		color: var(--mcs-text);
		font-size: 0.875rem;
	}
	.bulk-type-input:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
	form label {
		display: block;
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		margin-bottom: 0.75rem;
	}
	form input {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.5rem 0.65rem;
		background: var(--mcs-bg);
		border: 1px solid var(--mcs-border);
		border-radius: 6px;
		color: var(--mcs-text);
		font-size: 0.875rem;
	}
	form input:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
	form input.input-error {
		border-color: #c53030;
	}
	form input.input-error:focus {
		border-color: #c53030;
	}
	form button {
		margin-top: 0.25rem;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		border-radius: 4px;
		border: none;
		cursor: pointer;
	}
	form button.btn-primary {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
		font-weight: 500;
	}
	form button.btn-primary:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.modal {
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		width: var(--mcs-modal-width);
		min-width: var(--mcs-modal-width);
		max-width: min(var(--mcs-modal-width), 90vw);
		min-height: var(--mcs-modal-min-height);
		max-height: var(--mcs-modal-max-height);
		overflow: auto;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}
	.modal.confirm-modal {
		min-height: auto;
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	.modal-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--mcs-text);
	}
	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: var(--mcs-radius);
	}
	.close-btn:hover {
		color: var(--mcs-text);
		background: var(--mcs-surface-alt);
	}
	.modal-body {
		padding: 1rem;
	}
	.modal-body label:not(.bulk-ack) {
		display: block;
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		margin-bottom: 0.75rem;
	}
	.modal-body input:not([type='checkbox']) {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.5rem 0.65rem;
		background: var(--mcs-bg);
		border: 1px solid var(--mcs-border);
		border-radius: 6px;
		color: var(--mcs-text);
		font-size: 0.875rem;
	}
	.modal-body input:focus {
		outline: none;
		border-color: var(--mcs-accent);
	}
	.modal-body input.input-error {
		border-color: #c53030;
	}
	.modal-body label.label-required:has(input.input-error) {
		color: #c53030;
	}
	.modal-body input.path-readonly {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text-muted);
		cursor: default;
	}
	.modal-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		flex-wrap: wrap;
	}
	.modal-actions .spacer {
		flex: 1;
	}
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
		border: 1px solid var(--mcs-border);
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		border-radius: 4px;
		cursor: pointer;
	}
	.btn-secondary:hover {
		background: var(--mcs-border);
	}
	.btn-danger {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
		border: none;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		border-radius: 4px;
		cursor: pointer;
		font-weight: 500;
	}
	.btn-danger:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.confirm-text {
		margin: 0 0 1rem;
		font-size: 0.875rem;
		color: var(--mcs-text);
		line-height: 1.4;
	}
</style>
