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
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import type { Component } from 'svelte';
	import { startProjectTourFromCurrentProject } from '$lib/stores/tutorial';
	import type { TutorialExampleKind } from '$lib/tutorial-kinds.js';

	interface WelcomeBrief {
		summary: string;
		pluginId?: string;
		streamIds: string[];
		displays: string[];
		primaryObjectName?: string;
	}

	const WELCOME_BRIEFS: Record<TutorialExampleKind | 'generic', WelcomeBrief> = {
		generic: {
			summary:
				'Post samples to /api/ingest, then drag a display from the Explorer onto the canvas.',
			streamIds: ['my-hardware:temperature', 'ops:status', 'vehicle:gps'],
			displays: ['line-plot', 'gauge', 'map-view', 'telemetry-table']
		},
		rocket: {
			summary:
				'Synthetic rocket telemetry — altitude, velocity, Max-Q, GPS, and a flight timeline.',
			pluginId: 'rocket-mission',
			streamIds: ['rocket:altitude', 'rocket:velocity', 'rocket:maxq', 'rocket:gps'],
			displays: ['line-plot', 'gauge', 'map-view', 'telemetry-table', 'gantt-chart'],
			primaryObjectName: 'Mission layout'
		},
		ndvi: {
			summary:
				'Agriculture Example Project',
			pluginId: 'agri-ndvi-mission',
			streamIds: ['agri:field_ndvi', 'agri:target_ndvi', 'agri:soil_moisture', 'agri:gps'],
			displays: ['map-view', 'overlay-plot', 'gauge', 'telemetry-table', 'gantt-chart'],
			primaryObjectName: 'Field layout'
		},
		system: {
			summary:
				'Samples the host machine into sys:* streams with plots, gauges, a table, and a location map.',
			pluginId: 'system-sensor',
			streamIds: ['sys:cpu_usage', 'sys:mem_used_pct', 'sys:disk_used_pct', 'sys:location'],
			displays: ['line-plot', 'gauge', 'telemetry-table', 'map-view'],
			primaryObjectName: 'System layout'
		}
	};

	function getWelcomeBrief(kind: TutorialExampleKind | null | undefined): WelcomeBrief {
		return kind ? WELCOME_BRIEFS[kind] : WELCOME_BRIEFS.generic;
	}

	let resolvedView: Component<any> | null = $state(null);
	let resolvingType: string = $state('');
	let ingestOrigin = $state('');
	let exportBusy = $state(false);
	let welcomeHint = $state('');
	let welcomeHintTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (browser) {
			ingestOrigin = window.location.origin;
		}
	});

	function showWelcomeHint(msg: string) {
		if (welcomeHintTimer) clearTimeout(welcomeHintTimer);
		welcomeHint = msg;
		welcomeHintTimer = setTimeout(() => {
			welcomeHint = '';
			welcomeHintTimer = null;
		}, 2200);
	}

	async function copyText(text: string, okMsg: string) {
		try {
			await navigator.clipboard.writeText(text);
			showWelcomeHint(okMsg);
		} catch {
			showWelcomeHint('Could not copy');
		}
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
		if (false) return;
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

	async function openPrimaryLayout(primaryObjectName: string | undefined) {
		const proj = $currentProject;
		if (!proj || !primaryObjectName) return;
		try {
			const tree = await fetch(`/api/projects/${proj.id}/objects`).then((r) => (r.ok ? r.json() : null));
			if (!tree) return;
			const match = findObjectByName(tree, primaryObjectName);
			if (match) {
				await goto(`?object=${match.id}`);
			}
		} catch {
			// no-op; button stays available
		}
	}

	function findObjectByName(
		node: { id: string; name?: string; children?: unknown[] } | null | undefined,
		name: string
	): { id: string } | null {
		if (!node) return null;
		if (node.name === name) return { id: node.id };
		const children = Array.isArray(node.children) ? node.children : [];
		for (const child of children) {
			const found = findObjectByName(
				child as { id: string; name?: string; children?: unknown[] },
				name
			);
			if (found) return found;
		}
		return null;
	}

	let curlSnippet = $derived.by(() => {
		const proj = $currentProject;
		if (!proj || !ingestOrigin) return '';
		return `curl -X POST ${ingestOrigin}/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "${proj.id}",
    "streamId": "my-hardware:temperature",
    "values": { "value": 22.5 }
  }'`;
	});

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
	{@const brief = getWelcomeBrief($currentProject?.settings?.tutorialExampleKind)}
	<div class="project-welcome">
		<div class="welcome-card">
			<h2 class="welcome-title">{$selectedObject.name}</h2>
			<p class="welcome-summary">{brief.summary}</p>

			<div class="welcome-actions">
				{#if brief.primaryObjectName}
					<button
						type="button"
						class="btn-primary"
						onclick={() => openPrimaryLayout(brief.primaryObjectName)}
					>
						Open {brief.primaryObjectName}
					</button>
				{/if}
				<button
					type="button"
					class="btn-secondary"
					onclick={() => startProjectTourFromCurrentProject()}
				>
					Take a project tour
				</button>
				{#if !false}
					<button
						type="button"
						class="btn-secondary"
						disabled={exportBusy}
						onclick={exportProjectAsJson}
					>
						{exportBusy ? 'Exporting…' : 'Export layout as JSON'}
					</button>
				{/if}
				<button
					type="button"
					class="btn-ghost"
					onclick={() => copyText($currentProject!.id, 'Project ID copied')}
				>
					Copy project ID
				</button>
			</div>

			<div class="welcome-meta">
				{#if brief.pluginId}
					<div class="meta-row">
						<span class="meta-label">Source</span>
						<div class="token-list">
							<code class="token-chip">Built-in source: {brief.pluginId}</code>
						</div>
					</div>
				{/if}
				<div class="meta-row">
					<span class="meta-label">Streams</span>
					<div class="token-list">
						{#each brief.streamIds as streamId}
							<code class="token-chip">{streamId}</code>
						{/each}
					</div>
				</div>
				<div class="meta-row">
					<span class="meta-label">Displays</span>
					<div class="token-list">
						{#each brief.displays as display}
							<span class="token-chip token-chip-plain">{display}</span>
						{/each}
					</div>
				</div>
			</div>

			{#if !false}
				<details class="welcome-ingest">
					<summary>Feed your data</summary>
					<p class="welcome-ingest-note">
						Post to <code>/api/ingest</code> with this project's ID. Reuse the built-in stream names above
						and the existing displays will pick them up automatically.
					</p>
					<div class="snippet-block">
						<div class="snippet-head">
							<span>curl</span>
							<button
								type="button"
								class="copy-btn"
								onclick={() => copyText(curlSnippet, 'Snippet copied')}>Copy</button
							>
						</div>
						<pre class="snippet-pre">{curlSnippet || '…'}</pre>
					</div>
				</details>
			{/if}

			{#if welcomeHint}
				<p class="welcome-hint" role="status">{welcomeHint}</p>
			{/if}
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
	.welcome-summary {
		margin: 0;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--mcs-text-muted);
	}
	.welcome-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.welcome-actions .btn-primary,
	.welcome-actions .btn-secondary,
	.welcome-actions .btn-ghost {
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
	.welcome-actions .btn-secondary:hover,
	.welcome-actions .btn-ghost:hover {
		background: var(--mcs-border);
	}
	.welcome-actions .btn-ghost {
		background: transparent;
		border: 1px solid transparent;
		color: var(--mcs-text-muted);
	}
	.welcome-actions button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.welcome-actions button:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 1px;
	}
	.welcome-meta {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding-top: 0.35rem;
		border-top: 1px solid var(--mcs-border);
	}
	.meta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.55rem 0.75rem;
		padding-top: 0.65rem;
	}
	.meta-label {
		flex-shrink: 0;
		min-width: 4.5rem;
		font-size: 0.72rem;
		font-family: var(--mcs-font-mono, monospace);
		letter-spacing: 0.05em;
		color: var(--mcs-text-muted);
	}
	.token-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.token-chip {
		display: inline-flex;
		padding: 0.15rem 0.45rem;
		border: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		font-family: var(--mcs-font-mono, monospace);
		font-size: 0.72rem;
		color: var(--mcs-text);
	}
	.token-chip-plain {
		font-family: var(--mcs-font-sans);
		color: var(--mcs-text-muted);
	}
	.welcome-ingest {
		border-top: 1px solid var(--mcs-border);
		padding-top: 0.75rem;
	}
	.welcome-ingest > summary {
		cursor: pointer;
		list-style: none;
		font-size: 0.82rem;
		color: var(--mcs-text-muted);
	}
	.welcome-ingest > summary::marker,
	.welcome-ingest > summary::-webkit-details-marker {
		display: none;
	}
	.welcome-ingest > summary::before {
		content: '+ ';
		font-family: var(--mcs-font-mono, monospace);
		color: var(--mcs-text-muted);
	}
	.welcome-ingest[open] > summary::before {
		content: '− ';
	}
	.welcome-ingest-note {
		margin: 0.6rem 0 0.5rem;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--mcs-text-muted);
	}
	.welcome-ingest-note code {
		font-family: var(--mcs-font-mono, monospace);
		font-size: 0.75rem;
		padding: 0 0.25rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
	}
	.snippet-block {
		border: 1px solid var(--mcs-border);
		overflow: hidden;
		background: var(--mcs-bg);
	}
	.snippet-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.5rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--mcs-text-muted);
		background: var(--mcs-surface-alt);
		border-bottom: 1px solid var(--mcs-border);
	}
	.copy-btn {
		padding: 0.22rem 0.5rem;
		font-size: 0.72rem;
		font-family: var(--mcs-font-sans);
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		cursor: pointer;
	}
	.copy-btn:hover {
		background: var(--mcs-border);
	}
	.snippet-pre {
		margin: 0;
		padding: 0.6rem 0.65rem;
		font-size: 0.72rem;
		line-height: 1.5;
		overflow: auto;
		max-height: 11rem;
		font-family: var(--mcs-font-mono, monospace);
		color: var(--mcs-text);
		white-space: pre;
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
		.meta-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.35rem;
		}
	}
</style>
