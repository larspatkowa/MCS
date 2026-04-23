<script lang="ts">
	import type { NotebookProps, NotebookEntry } from '$lib/objects/types.js';
	import { get } from 'svelte/store';
	import { currentProject, selectedObject } from '$lib/stores/project';
	import { Plus, Tag, Trash2 } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';
	import { untrack } from 'svelte';

	let { objectId, props } = $props<{ objectId: string; props: NotebookProps }>();

	const label = $derived(props.label ?? 'Notebook');
	const showTags = $derived(props.showTags !== false);
	const showAuthor = $derived(props.showAuthor === true);
	const newestFirst = $derived(props.newestFirst !== false);

	let entries = $state<NotebookEntry[]>(untrack(() => props.entries ?? []));
	let newText = $state('');
	let newTags = $state('');

	$effect(() => {
		if (props.entries) entries = props.entries;
	});

	const sorted = $derived.by(() => {
		const list = [...entries];
		list.sort((a, b) => (newestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp));
		return list;
	});

	function uid() {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	}

	function addEntry() {
		const text = newText.trim();
		if (!text) return;
		const entry: NotebookEntry = {
			id: uid(),
			timestamp: Math.floor(Date.now() / 1000),
			text,
			tags: newTags.trim()
				? newTags
						.split(',')
						.map((t) => t.trim())
						.filter(Boolean)
				: undefined
		};
		entries = [...entries, entry];
		newText = '';
		newTags = '';
		schedulePatch();
	}

	function removeEntry(id: string) {
		entries = entries.filter((e) => e.id !== id);
		schedulePatch();
	}

	let patchTimer: ReturnType<typeof setTimeout> | null = null;
	function schedulePatch() {
		if (patchTimer) clearTimeout(patchTimer);
		patchTimer = setTimeout(() => {
			patchTimer = null;
			const proj = get(currentProject);
			if (!proj || proj.id === 'gallery') return;
			const body = { props: { ...props, entries } };
			fetch(`/api/projects/${proj.id}/objects/${objectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		}, 600);
	}

	function formatTs(ts: number): string {
		const d = new Date(ts * 1000);
		return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			addEntry();
		}
	}
</script>

<div class="nb-root">
	<ErrorBoundary>
		<!-- Input area -->
		<div class="nb-input">
			<textarea
				bind:value={newText}
				placeholder="Log a note… (⌘+Enter to add)"
				onkeydown={handleKeydown}
				rows={2}
			></textarea>
			<div class="nb-input-footer">
				{#if showTags}
					<div class="tag-input">
						<Tag size={12} />
						<input type="text" bind:value={newTags} placeholder="Tags (comma-separated)" />
					</div>
				{/if}
				<button class="add-btn" onclick={addEntry} disabled={!newText.trim()}>
					<Plus size={14} /> Add entry
				</button>
			</div>
		</div>

		<!-- Entries list -->
		<div class="nb-list">
			{#each sorted as entry (entry.id)}
				<div class="nb-entry">
					<div class="entry-ts">{formatTs(entry.timestamp)}</div>
					<div class="entry-text">{entry.text}</div>
					{#if showTags && entry.tags?.length}
						<div class="entry-tags">
							{#each entry.tags as tag}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					{/if}
					{#if showAuthor && entry.author}
						<div class="entry-author">{entry.author}</div>
					{/if}
					<button class="remove-btn" onclick={() => removeEntry(entry.id)} title="Delete entry">
						<Trash2 size={12} />
					</button>
				</div>
			{/each}
			{#if entries.length === 0}
				<div class="empty">No entries yet. Add a note above.</div>
			{/if}
		</div>
	</ErrorBoundary>
</div>

<style>
	.nb-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--mcs-font-sans);
	}

	.nb-input {
		flex-shrink: 0;
		padding: 8px 10px;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
	}

	.nb-input textarea {
		width: 100%;
		resize: none;
		background: var(--mcs-bg);
		color: var(--mcs-text);
		border: 1px solid var(--mcs-border);
		border-radius: 4px;
		padding: 6px 8px;
		font-family: var(--mcs-font-sans);
		font-size: 12px;
		outline: none;
		box-sizing: border-box;
	}

	.nb-input textarea:focus {
		border-color: var(--mcs-accent, #4f9cf9);
	}

	.nb-input-footer {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
	}

	.tag-input {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 4px;
		color: var(--mcs-text-muted);
	}

	.tag-input input {
		flex: 1;
		background: none;
		border: none;
		color: var(--mcs-text);
		font-size: 11px;
		font-family: var(--mcs-font-sans);
		outline: none;
	}

	.add-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		background: var(--mcs-accent, #4f9cf9);
		color: #fff;
		border: none;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
	}

	.add-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.add-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.nb-list {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.nb-entry {
		position: relative;
		padding: 8px 10px;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
	}

	.nb-entry:hover {
		background: color-mix(in srgb, var(--mcs-accent, #4f9cf9) 4%, transparent);
	}

	.entry-ts {
		font-family: var(--mcs-font-mono);
		font-size: 10px;
		color: var(--mcs-text-muted);
		margin-bottom: 2px;
		font-variant-numeric: tabular-nums;
	}

	.entry-text {
		font-size: 12px;
		color: var(--mcs-text);
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.entry-tags {
		display: flex;
		gap: 4px;
		margin-top: 4px;
		flex-wrap: wrap;
	}

	.tag {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text-muted);
		font-size: 9px;
		padding: 1px 6px;
		border-radius: 8px;
		border: 1px solid var(--mcs-border);
	}

	.entry-author {
		font-size: 10px;
		color: var(--mcs-text-muted);
		margin-top: 2px;
		font-style: italic;
	}

	.remove-btn {
		position: absolute;
		top: 6px;
		right: 8px;
		background: none;
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.12s;
		padding: 2px;
	}

	.nb-entry:hover .remove-btn {
		opacity: 0.5;
	}

	.remove-btn:hover {
		opacity: 1 !important;
		color: #ef4444;
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 12px;
		padding: 2rem;
	}
</style>
