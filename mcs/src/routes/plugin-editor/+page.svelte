<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { basicSetup, EditorView } from 'codemirror';
	import { EditorState } from '@codemirror/state';
	import { javascript } from '@codemirror/lang-javascript';
	import { python } from '@codemirror/lang-python';
	import { keymap } from '@codemirror/view';
	import { currentProject } from '$lib/stores/project';

	type FileRow = { name: string; id: string };

	let editorHost = $state<HTMLDivElement | undefined>(undefined);
	let files = $state<FileRow[]>([]);
	let selectedName = $state<string | null>(null);
	let loadError = $state<string | null>(null);
	let saveError = $state<string | null>(null);
	let actionMsg = $state<string | null>(null);
	let dirty = $state(false);
	let loadingList = $state(true);
	let loadingFile = $state(false);
	let creating = $state(false);
	let pluginBusy = $state(false);

	let view = $state.raw<EditorView | undefined>(undefined);
	let skipNextDocListener = false;

	function langExtension(filename: string) {
		return filename.toLowerCase().endsWith('.py') ? python() : javascript();
	}

	function destroyEditor() {
		view?.destroy();
		view = undefined;
	}

	function buildState(content: string, filename: string) {
		return EditorState.create({
			doc: content,
			extensions: [
				basicSetup,
				langExtension(filename),
				keymap.of([
					{
						key: 'Mod-s',
						preventDefault: true,
						run: () => {
							void saveCurrent();
							return true;
						}
					}
				]),
				EditorView.updateListener.of((u) => {
					if (skipNextDocListener) return;
					if (u.docChanged) dirty = true;
				})
			]
		});
	}

	function mountEditor(content: string, filename: string) {
		if (!editorHost) return;
		destroyEditor();
		skipNextDocListener = true;
		const state = buildState(content, filename);
		view = new EditorView({ state, parent: editorHost });
		queueMicrotask(() => {
			skipNextDocListener = false;
		});
		dirty = false;
	}

	async function refreshFiles() {
		loadingList = true;
		loadError = null;
		try {
			const res = await fetch('/api/plugins/files');
			const data = (await res.json()) as { files?: FileRow[] };
			if (!res.ok) throw new Error('Failed to list files');
			files = Array.isArray(data.files) ? data.files : [];
			if (files.length > 0 && !selectedName) {
				selectedName = files[0].name;
			}
			if (files.length === 0) {
				selectedName = null;
				destroyEditor();
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load';
			files = [];
		} finally {
			loadingList = false;
		}
	}

	async function loadSelected() {
		if (!selectedName) {
			destroyEditor();
			return;
		}
		loadingFile = true;
		loadError = null;
		try {
			const res = await fetch(`/api/plugins/files/${encodeURIComponent(selectedName)}`);
			const data = (await res.json()) as { content?: string; error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Failed to read');
			mountEditor(typeof data.content === 'string' ? data.content : '', selectedName);
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to read';
			destroyEditor();
		} finally {
			loadingFile = false;
		}
	}

	async function saveCurrent() {
		if (!view || !selectedName) return;
		saveError = null;
		actionMsg = null;
		const content = view.state.doc.toString();
		try {
			const res = await fetch(`/api/plugins/files/${encodeURIComponent(selectedName)}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Save failed');
			dirty = false;
			actionMsg = 'Saved';
			setTimeout(() => {
				actionMsg = null;
			}, 2000);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Save failed';
		}
	}

	async function createFile(ext: 'mjs' | 'py') {
		creating = true;
		saveError = null;
		try {
			const res = await fetch('/api/plugins/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ext })
			});
			const data = (await res.json()) as { name?: string; error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Create failed');
			await refreshFiles();
			if (data.name) selectedName = data.name;
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Create failed';
		} finally {
			creating = false;
		}
	}

	async function deleteCurrent() {
		if (!selectedName) return;
		if (!confirm(`Delete ${selectedName}?`)) return;
		saveError = null;
		try {
			const res = await fetch(`/api/plugins/files/${encodeURIComponent(selectedName)}`, {
				method: 'DELETE'
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Delete failed');
			selectedName = null;
			destroyEditor();
			await refreshFiles();
			if (files.length > 0) {
				selectedName = files[0].name;
				await loadSelected();
			}
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Delete failed';
		}
	}

	const selectedId = $derived(selectedName ? selectedName.replace(/\.(mjs|py)$/i, '') : null);
	const projectId = $derived($currentProject?.id ?? null);

	async function refreshRunning(): Promise<string[]> {
		const res = await fetch('/api/plugins');
		const list = (await res.json()) as { id?: string }[];
		return Array.isArray(list) ? (list.map((r) => r.id).filter(Boolean) as string[]) : [];
	}

	let runningIds = $state<string[]>([]);

	async function pollRunning() {
		try {
			runningIds = await refreshRunning();
		} catch {
			runningIds = [];
		}
	}

	async function startPlugin() {
		if (!selectedId || !projectId) return;
		pluginBusy = true;
		actionMsg = null;
		saveError = null;
		try {
			const res = await fetch('/api/plugins/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: selectedId, projectId })
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Start failed');
			await pollRunning();
			actionMsg = 'Started';
			setTimeout(() => {
				actionMsg = null;
			}, 2000);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Start failed';
		} finally {
			pluginBusy = false;
		}
	}

	async function stopPlugin() {
		if (!selectedId) return;
		pluginBusy = true;
		saveError = null;
		try {
			const res = await fetch('/api/plugins/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: selectedId })
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Stop failed');
			await pollRunning();
			actionMsg = 'Stopped';
			setTimeout(() => {
				actionMsg = null;
			}, 2000);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Stop failed';
		} finally {
			pluginBusy = false;
		}
	}

	async function restartPlugin() {
		if (!selectedId || !projectId) return;
		pluginBusy = true;
		saveError = null;
		actionMsg = null;
		try {
			await fetch('/api/plugins/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: selectedId })
			});
			await pollRunning();
			const res = await fetch('/api/plugins/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: selectedId, projectId })
			});
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'Restart failed');
			await pollRunning();
			actionMsg = 'Restarted';
			setTimeout(() => {
				actionMsg = null;
			}, 2000);
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Restart failed';
		} finally {
			pluginBusy = false;
		}
	}

	onMount(async () => {
		await refreshFiles();
		await pollRunning();
	});

	onDestroy(() => {
		destroyEditor();
	});

	$effect(() => {
		const name = selectedName;
		const host = editorHost;
		if (!name || !host) return;
		void loadSelected();
	});
</script>

<svelte:head>
	<title>Plugin editor — MCS</title>
</svelte:head>

<div class="pe-page">
	<header class="pe-header">
		<div class="pe-header-left">
			<button type="button" class="pe-back" onclick={() => goto('/')}>All projects</button>
			{#if $currentProject}
				<button
					type="button"
					class="pe-back"
					onclick={() => goto(`/project/${$currentProject.id}`)}
				>
					Back to project
				</button>
			{/if}
			<h1 class="pe-title">Plugin editor</h1>
		</div>
		<div class="pe-header-actions">
			{#if actionMsg}<span class="pe-msg">{actionMsg}</span>{/if}
			<button
				type="button"
				class="pe-btn pe-btn-primary"
				disabled={!view || !selectedName || loadingFile}
				onclick={() => saveCurrent()}>Save</button
			>
			<button
				type="button"
				class="pe-btn"
				disabled={!selectedId || pluginBusy || !projectId}
				title={projectId
					? 'Run script with current project'
					: 'Open a project from another tab first'}
				onclick={() => startPlugin()}>Start</button
			>
			<button
				type="button"
				class="pe-btn"
				disabled={!selectedId || pluginBusy || !runningIds.includes(selectedId)}
				onclick={() => stopPlugin()}>Stop</button
			>
			<button
				type="button"
				class="pe-btn"
				disabled={!selectedId || pluginBusy || !projectId}
				onclick={() => restartPlugin()}>Restart</button
			>
		</div>
	</header>

	{#if saveError}<p class="pe-error" role="alert">{saveError}</p>{/if}
	{#if loadError}<p class="pe-error" role="alert">{loadError}</p>{/if}

	<div class="pe-main">
		<aside class="pe-sidebar">
			<div class="pe-side-head">
				<h2 class="pe-side-title">Files</h2>
				<div class="pe-new-row">
					<button
						type="button"
						class="pe-btn pe-btn-small"
						disabled={creating}
						onclick={() => createFile('mjs')}>New .mjs</button
					>
					<button
						type="button"
						class="pe-btn pe-btn-small"
						disabled={creating}
						onclick={() => createFile('py')}>New .py</button
					>
				</div>
			</div>
			{#if loadingList}
				<p class="pe-muted">Loading…</p>
			{:else if files.length === 0}
				<p class="pe-muted">
					No scripts yet. Create one to store under <code>data/user-plugins/</code>.
				</p>
			{:else}
				<ul class="pe-file-list">
					{#each files as f}
						<li>
							<button
								type="button"
								class="pe-file"
								class:active={selectedName === f.name}
								onclick={async () => {
									if (f.name === selectedName) return;
									if (dirty && !confirm('Discard unsaved changes in the editor?')) return;
									selectedName = f.name;
								}}
							>
								{f.name}
								{#if runningIds.includes(f.id)}
									<span class="pe-running">running</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<button
				type="button"
				class="pe-btn pe-btn-danger pe-btn-block"
				disabled={!selectedName}
				onclick={() => deleteCurrent()}>Delete file</button
			>
		</aside>
		<section class="pe-editor-wrap">
			{#if loadingFile}
				<p class="pe-muted pe-editor-loading">Loading file…</p>
			{/if}
			<div class="pe-editor-host" bind:this={editorHost}></div>
			{#if dirty}
				<p class="pe-dirty">Unsaved changes (Ctrl/Cmd+S)</p>
			{/if}
			<p class="pe-hint">
				Scripts must read <code>MCS_API_URL</code> and <code>MCS_PROJECT_ID</code> from the environment.
				After editing, use Restart so the process reloads your code.
			</p>
		</section>
	</div>
</div>

<style>
	.pe-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--mcs-bg);
		color: var(--mcs-text);
	}
	.pe-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
	}
	.pe-header-left {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
	}
	.pe-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
	}
	.pe-back {
		font-family: inherit;
		font-size: 0.8125rem;
		padding: 0.3rem 0.55rem;
		border: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.pe-header-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.pe-msg {
		font-size: 0.8125rem;
		color: var(--mcs-accent);
		margin-right: 0.25rem;
	}
	.pe-btn {
		font-family: inherit;
		font-size: 0.8125rem;
		padding: 0.35rem 0.65rem;
		border: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.pe-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.pe-btn-primary {
		background: var(--mcs-accent);
		border-color: var(--mcs-accent);
		color: var(--mcs-on-accent, #fff);
	}
	.pe-btn-small {
		padding: 0.25rem 0.45rem;
		font-size: 0.75rem;
	}
	.pe-btn-danger {
		border-color: var(--mcs-accent);
		color: var(--mcs-accent);
		background: transparent;
	}
	.pe-btn-block {
		width: 100%;
		margin-top: 0.75rem;
	}
	.pe-error {
		margin: 0.5rem 1rem;
		color: var(--mcs-accent);
		font-size: 0.875rem;
	}
	.pe-main {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.pe-sidebar {
		width: 220px;
		flex-shrink: 0;
		border-right: 1px solid var(--mcs-border);
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		background: var(--mcs-surface);
		overflow: auto;
	}
	.pe-side-head {
		margin-bottom: 0.5rem;
	}
	.pe-side-title {
		margin: 0 0 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--mcs-text-muted);
	}
	.pe-new-row {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.pe-file-list {
		list-style: none;
		margin: 0;
		padding: 0;
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.pe-file {
		width: 100%;
		text-align: left;
		padding: 0.4rem 0.45rem;
		margin-bottom: 0.25rem;
		border: 1px solid transparent;
		border-radius: var(--mcs-radius);
		background: transparent;
		color: var(--mcs-text);
		font-family: var(--mcs-font-mono);
		font-size: 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem;
	}
	.pe-file.active {
		background: var(--mcs-surface-alt);
		border-color: var(--mcs-border);
	}
	.pe-running {
		font-size: 0.65rem;
		color: var(--mcs-accent);
		flex-shrink: 0;
	}
	.pe-muted {
		font-size: 0.8125rem;
		color: var(--mcs-text-muted);
		margin: 0.25rem 0;
	}
	.pe-editor-wrap {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.pe-editor-loading {
		padding: 0.5rem 1rem;
	}
	.pe-editor-host {
		flex: 1;
		min-height: 200px;
		overflow: auto;
		border-bottom: 1px solid var(--mcs-border);
	}
	.pe-editor-host :global(.cm-editor) {
		height: 100%;
		min-height: 320px;
	}
	.pe-editor-host :global(.cm-scroller) {
		font-family: var(--mcs-font-mono);
		font-size: 0.8125rem;
	}
	.pe-dirty {
		margin: 0.35rem 1rem;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
	}
	.pe-hint {
		margin: 0.5rem 1rem 1rem;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		line-height: 1.4;
	}
	.pe-hint code {
		font-size: 0.7rem;
	}
</style>
