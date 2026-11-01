<script lang="ts">
	import { renderMarkdown as md } from '$lib/markdown.js';
	import type { MarkdownNoteProps } from '$lib/objects/types.js';
	import { FileText, Pencil, Eye, Columns2 } from '@lucide/svelte';
	import { currentProject } from '$lib/stores/project.js';
	import ErrorBoundary from '../ErrorBoundary.svelte';
	import { untrack } from 'svelte';

	let { objectId, props } = $props<{ objectId: string; props: MarkdownNoteProps }>();

	type EditorMode = 'preview' | 'split' | 'edit';
	let mode = $state<EditorMode>('preview');
	let rootEl = $state<HTMLDivElement | null>(null);
	let compact = $state(false);

	const content = $derived(props.content ?? '');
	let editText = $state(untrack(() => props.content ?? ''));

	$effect(() => {
		if (mode === 'preview') {
			editText = content;
		}
	});

	$effect(() => {
		const el = rootEl;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (!rect) return;
			compact = rect.width < 560 || rect.height < 340;
			if (compact && mode !== 'preview') mode = 'preview';
		});
		observer.observe(el);
		return () => observer.disconnect();
	});

	let saveTimeout: ReturnType<typeof setTimeout>;
	function save() {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			const projId = $currentProject?.id;
			if (!projId) return;
			try {
				await fetch(`/api/projects/${projId}/objects/${objectId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ props: { ...props, content: editText } })
				});
			} catch {}
		}, 800);
	}

	function setMode(nextMode: EditorMode) {
		if (mode !== 'preview' && nextMode === 'preview') {
			save();
		}
		if (mode === 'preview' && nextMode !== 'preview') {
			editText = content;
		}
		mode = nextMode;
	}
</script>

<div class="md-root" bind:this={rootEl}>
	<ErrorBoundary>
		{#if !compact}
			<div class="md-toolbar">
				<div class="md-mode-group" role="group" aria-label="Markdown note mode">
					<button
						class="md-toggle"
						class:active={mode === 'preview'}
						onclick={() => setMode('preview')}
						title="Preview"
					>
						<Eye size={13} />
						<span>Preview</span>
					</button>
					<button
						class="md-toggle"
						class:active={mode === 'split'}
						onclick={() => setMode('split')}
						title="Split"
					>
						<Columns2 size={13} />
						<span>Split</span>
					</button>
					<button
						class="md-toggle"
						class:active={mode === 'edit'}
						onclick={() => setMode('edit')}
						title="Edit"
					>
						<Pencil size={13} />
						<span>Edit</span>
					</button>
				</div>
			</div>
		{/if}

		{#if mode === 'edit'}
			<textarea
				class="md-editor"
				bind:value={editText}
				oninput={save}
				placeholder="Write markdown here…"
				spellcheck="false"
			></textarea>
		{:else if mode === 'split'}
			<div class="md-split">
				<textarea
					class="md-editor md-editor-split"
					bind:value={editText}
					oninput={save}
					placeholder="Write markdown here…"
					spellcheck="false"
				></textarea>
				<div class="md-body md-body-split">
					{@html md(editText)}
				</div>
			</div>
		{:else if content}
			<div class="md-body">
				{@html md(content)}
			</div>
		{:else}
			<div class="md-empty">
				<FileText size={20} />
				<span>Empty note — click edit to add content</span>
			</div>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.md-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		font-family: var(--mcs-font-sans);
	}

	.md-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 8px;
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}
	.md-mode-group {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.md-toggle {
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		border-radius: 999px;
		color: var(--mcs-text-muted);
		cursor: pointer;
		padding: 0.34rem 0.62rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		transition: color 0.15s;
	}
	.md-toggle:hover {
		color: var(--mcs-accent);
	}
	.md-toggle.active {
		color: var(--mcs-text);
		border-color: color-mix(in srgb, var(--mcs-accent) 40%, var(--mcs-border));
		background: color-mix(in srgb, var(--mcs-accent) 14%, var(--mcs-surface-alt));
	}
	.md-toggle span {
		font-size: 0.72rem;
		font-family: var(--mcs-font-mono);
	}

	.md-editor {
		flex: 1;
		padding: 12px 16px;
		font-family: var(--mcs-font-mono);
		font-size: 12px;
		line-height: 1.6;
		color: var(--mcs-text);
		background: var(--mcs-surface);
		border: none;
		resize: none;
		outline: none;
	}
	.md-split {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		min-height: 0;
	}
	.md-editor-split {
		border-right: 1px solid var(--mcs-border);
	}

	.md-body {
		flex: 1;
		overflow: auto;
		padding: 16px 20px;
		font-size: 13px;
		line-height: 1.65;
		color: var(--mcs-text);
	}
	.md-body-split {
		background: color-mix(in srgb, var(--mcs-surface) 92%, transparent);
	}

	.md-body :global(h1) {
		font-size: 20px;
		font-weight: 700;
		margin: 16px 0 8px;
	}
	.md-body :global(h2) {
		font-size: 16px;
		font-weight: 700;
		margin: 14px 0 6px;
	}
	.md-body :global(h3) {
		font-size: 14px;
		font-weight: 600;
		margin: 12px 0 4px;
	}
	.md-body :global(h4) {
		font-size: 13px;
		font-weight: 600;
		margin: 10px 0 4px;
		color: var(--mcs-text-muted);
	}
	.md-body :global(p) {
		margin: 0 0 8px;
	}
	.md-body :global(code) {
		font-family: var(--mcs-font-mono);
		font-size: 11px;
		background: color-mix(in srgb, var(--mcs-border) 40%, transparent);
		padding: 1px 5px;
		border-radius: 3px;
	}
	.md-body :global(pre) {
		background: color-mix(in srgb, var(--mcs-border) 30%, transparent);
		padding: 10px 14px;
		border-radius: 6px;
		overflow-x: auto;
		margin: 8px 0;
	}
	.md-body :global(pre code) {
		background: none;
		padding: 0;
	}
	.md-body :global(hr) {
		border: none;
		border-top: 1px solid var(--mcs-border);
		margin: 12px 0;
	}
	.md-body :global(ul) {
		padding-left: 18px;
		margin: 4px 0 8px;
	}
	.md-body :global(ol) {
		padding-left: 18px;
		margin: 4px 0 8px;
		list-style-type: decimal;
	}
	.md-body :global(li) {
		margin: 2px 0;
	}
	.md-body :global(strong) {
		font-weight: 600;
	}
	.md-body :global(del) {
		opacity: 0.55;
		text-decoration: line-through;
	}
	.md-body :global(img) {
		max-width: 100%;
		border-radius: 4px;
		margin: 4px 0;
	}
	.md-body :global(a) {
		color: var(--mcs-accent);
		text-decoration: underline;
	}
	.md-body :global(.md-file-link) {
		display: inline-flex;
		margin-top: 0.55rem;
	}
	.md-body :global(.md-pdf) {
		display: grid;
		gap: 0.35rem;
		margin: 0.8rem 0;
	}
	.md-body :global(.md-pdf iframe) {
		width: 100%;
		min-height: 22rem;
		border: 1px solid var(--mcs-border);
		border-radius: 10px;
		background: #fff;
	}
	.md-body :global(table) {
		border-collapse: collapse;
		width: 100%;
		margin: 8px 0;
		font-size: 12px;
	}
	.md-body :global(th) {
		padding: 6px 10px;
		border: 1px solid var(--mcs-border);
		font-weight: 600;
		text-align: left;
		background: var(--mcs-surface-alt);
	}
	.md-body :global(td) {
		padding: 5px 10px;
		border: 1px solid var(--mcs-border);
	}
	.md-body :global(blockquote) {
		border-left: 3px solid var(--mcs-border);
		padding: 4px 12px;
		margin: 8px 0;
		color: var(--mcs-text-muted);
	}

	.md-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		flex: 1;
		color: var(--mcs-text-muted);
		font-size: 12px;
	}
	@media (max-width: 900px) {
		.md-split {
			grid-template-columns: 1fr;
		}
		.md-editor-split {
			border-right: none;
			border-bottom: 1px solid var(--mcs-border);
		}
	}
</style>
