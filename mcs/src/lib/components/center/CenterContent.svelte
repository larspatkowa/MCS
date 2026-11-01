<script lang="ts">
	import {
		currentProject,
		selectedObject,
		selectedObjectId,
		selectedObjectLoading,
		selectedObjectError,
		invalidateSelectedObject
	} from '$lib/stores/project';
	import { getView, resolveView, hasView } from '$lib/object-types/views.js';
	import UnknownView from './UnknownView.svelte';
	import FolderView from './FolderView.svelte';
	import type { Component } from 'svelte';
	import { setFixedBounds } from '$lib/stores/timeline.js';
	import { startRunReplay } from '$lib/stores/run.js';

	let resolvedView: Component<any> | null = $state(null);
	let resolvingType: string = $state('');
	let exportBusy = $state(false);
	let runImportBusy = $state(false);
	let runImportFileInput = $state<HTMLInputElement | null>(null);
	let mediaImportBusy = $state(false);
	let mediaImportFileInput = $state<HTMLInputElement | null>(null);
	let welcomeHint = $state('');
	let welcomeHintTimer: ReturnType<typeof setTimeout> | null = null;

	function showWelcomeHint(msg: string) {
		if (welcomeHintTimer) clearTimeout(welcomeHintTimer);
		welcomeHint = msg;
		welcomeHintTimer = setTimeout(() => {
			welcomeHint = '';
			welcomeHintTimer = null;
		}, 2200);
	}

	function slugify(input: string): string {
		return (
			input
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/(^-|-$)/g, '') || 'project'
		);
	}

	async function exportProjectAsJson() {
		const proj = $currentProject;
		if (!proj || exportBusy) return;
		exportBusy = true;
		try {
			const res = await fetch(`/api/projects/${proj.id}/objects`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const tree = await res.json();
			const payload = {
				exportVersion: 1,
				exportedAt: new Date().toISOString(),
				project: {
					id: proj.id,
					name: proj.name,
					settings: proj.settings ?? null
				},
				tree
			};
			const json = JSON.stringify(payload, null, 2);
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${slugify(proj.name)}-layout.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			showWelcomeHint('Layout exported');
		} catch {
			showWelcomeHint('Export failed');
		} finally {
			exportBusy = false;
		}
	}

	async function importRunFile(event: Event): Promise<void> {
		const project = $currentProject;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!project || !file || runImportBusy) return;
		runImportBusy = true;
		try {
			const form = new FormData();
			form.set('file', file);
			const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/runs/import`, {
				method: 'POST',
				body: form
			});
			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.error ?? `HTTP ${response.status}`);
			if (typeof result?.firstTimestamp === 'number' && typeof result?.lastTimestamp === 'number') {
				setFixedBounds(
					result.firstTimestamp,
					Math.max(result.firstTimestamp + 0.001, result.lastTimestamp)
				);
			}
			if (result?.run?.id) await startRunReplay(project.id, result.run.id);
			showWelcomeHint(
				`Imported ${result.samples ?? 0} samples from ${file.name} and opened replay`
			);
		} catch (error) {
			showWelcomeHint(error instanceof Error ? error.message : 'Run import failed');
		} finally {
			runImportBusy = false;
			input.value = '';
		}
	}

	async function importMediaFile(event: Event): Promise<void> {
		const project = $currentProject;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!project || !file || mediaImportBusy) return;
		mediaImportBusy = true;
		try {
			const form = new FormData();
			form.set('file', file);
			const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/media`, {
				method: 'POST',
				body: form
			});
			const result = await response.json().catch(() => null);
			if (!response.ok) throw new Error(result?.error ?? `HTTP ${response.status}`);
			showWelcomeHint(`Imported media ${result?.asset?.sourceName ?? file.name}`);
		} catch (error) {
			showWelcomeHint(error instanceof Error ? error.message : 'Media import failed');
		} finally {
			mediaImportBusy = false;
			input.value = '';
		}
	}

	// Resolve view component (lazy or cached) whenever the selected object type changes
	$effect(() => {
		const obj = $selectedObject;
		if (!obj || obj.type === 'project' || obj.type === 'folder') {
			resolvedView = null;
			resolvingType = '';
			return;
		}

		const typeId = obj.type;

		const sync = getView(typeId);
		if (sync) {
			resolvedView = sync;
			resolvingType = typeId;
			return;
		}

		if (!hasView(typeId)) {
			resolvedView = null;
			resolvingType = typeId;
			return;
		}

		resolvingType = typeId;
		resolvedView = null;
		resolveView(typeId)
			.then((comp) => {
				if (resolvingType === typeId && comp) {
					resolvedView = comp;
				}
			})
			.catch((err) => {
				console.error('[CenterContent] Failed to load view for', typeId, err);
			});
	});
</script>

{#if !$currentProject}
	<div class="empty">Open or create a project to start.</div>
{:else if !$selectedObjectId}
	<div class="empty">Select an object from the tree.</div>
{:else if $selectedObjectLoading && !$selectedObject}
	<div class="empty state-loading" role="status" aria-live="polite">Loading…</div>
{:else if $selectedObjectError}
	<div class="empty state-error">
		<p class="state-error-message">{$selectedObjectError}</p>
		<button type="button" class="state-retry-btn" onclick={() => invalidateSelectedObject()}
			>Retry</button
		>
	</div>
{:else if !$selectedObject}
	<div class="empty">Select an object from the tree.</div>
{:else if $selectedObject.type === 'project'}
	<div class="project-welcome">
		<div class="welcome-card">
			<h2 class="welcome-title">{$selectedObject.name}</h2>
			<div class="welcome-actions">
				<button
					type="button"
					class="btn-primary"
					disabled={exportBusy}
					onclick={exportProjectAsJson}
				>
					{exportBusy ? 'Exporting…' : 'Export layout'}
				</button>
				<button
					type="button"
					class="btn-secondary"
					disabled={runImportBusy}
					onclick={() => runImportFileInput?.click()}
				>
					{runImportBusy ? 'Importing…' : 'Import run'}
				</button>
				<input
					bind:this={runImportFileInput}
					class="visually-hidden"
					type="file"
					accept=".csv,.json,.ndjson,.jsonl,text/csv,application/json,application/x-ndjson"
					onchange={importRunFile}
				/>
				<button
					type="button"
					class="btn-secondary"
					disabled={mediaImportBusy}
					onclick={() => mediaImportFileInput?.click()}
				>
					{mediaImportBusy ? 'Importing…' : 'Import media'}
				</button>
				<input
					bind:this={mediaImportFileInput}
					class="visually-hidden"
					type="file"
					accept="video/*,audio/*,image/*"
					onchange={importMediaFile}
				/>
			</div>
			{#if welcomeHint}<p class="welcome-hint" role="status">{welcomeHint}</p>{/if}
		</div>
	</div>
{:else}
	<div class="center-view">
		{#if $selectedObject.type === 'folder'}
			<FolderView object={$selectedObject} />
		{:else if resolvedView && resolvingType === $selectedObject.type}
			{@const ViewComponent = resolvedView}
			{#key $selectedObject.id}
				<ViewComponent objectId={$selectedObject.id} props={$selectedObject.props ?? {}} />
			{/key}
		{:else if hasView($selectedObject.type)}
			<div class="empty state-loading" role="status" aria-live="polite">Loading view…</div>
		{:else}
			<UnknownView typeId={$selectedObject.type} />
		{/if}
	</div>
{/if}

<style>
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 0.9rem;
	}
	.state-loading {
		font-style: italic;
	}
	.state-error-message {
		margin: 0;
		text-align: center;
		max-width: 20rem;
	}
	.state-retry-btn {
		padding: 0.35rem 0.75rem;
		font-size: 0.85rem;
		font-family: var(--mcs-font-sans);
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: 0;
		cursor: pointer;
	}
	.state-retry-btn:hover {
		background: var(--mcs-border);
	}

	.center-view {
		height: 100%;
		min-height: 100%;
		width: 100%;
		min-width: 0;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		overflow: auto;
		box-sizing: border-box;
	}
	.center-view :global(> *) {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.project-welcome {
		display: flex;
		flex: 1;
		width: 100%;
		padding: 2rem 1.5rem;
		align-items: center;
		justify-content: center;
		overflow: auto;
	}
	.welcome-card {
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		padding: 1.75rem 1.9rem;
		max-width: 44rem;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.welcome-title {
		font-size: clamp(1.35rem, 1.15rem + 0.5vw, 1.6rem);
		font-weight: 600;
		color: var(--mcs-text);
		margin: 0;
		letter-spacing: -0.005em;
	}
	.welcome-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.welcome-actions .btn-primary,
	.welcome-actions .btn-secondary {
		padding: 0.45rem 0.9rem;
		font-size: 0.82rem;
		font-family: var(--mcs-font-sans);
		border-radius: 0;
		cursor: pointer;
	}
	.welcome-actions .btn-primary {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
		border: 1px solid var(--mcs-accent);
		font-weight: 600;
	}
	.welcome-actions .btn-secondary {
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
	}
	.welcome-actions .btn-secondary:hover {
		background: var(--mcs-border);
	}
	.welcome-actions button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.welcome-actions button:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
	}
	.welcome-hint {
		font-size: 0.75rem;
		color: var(--mcs-accent);
		margin: 0;
	}
	@media (max-width: 640px) {
		.project-welcome {
			padding: 1rem;
		}
		.welcome-card {
			padding: 1.1rem;
		}
	}
</style>
