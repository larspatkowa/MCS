<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import { getCreatableTypes } from '$lib/object-types/registry.js';
	import { X, LayoutDashboard, ChevronRight, ChevronDown } from '@lucide/svelte';
	import GridLayoutProps from '$lib/components/properties/GridLayoutProps.svelte';
	import FolderProps from '$lib/components/properties/FolderProps.svelte';

	type ModalProps = {
		onSave: (type: string, name: string, notes: string, props: Record<string, unknown>) => void;
		onCancel: () => void;
		saving?: boolean;
	};
	let { onSave, onCancel, saving = false }: ModalProps = $props();

	const TYPE_OPTIONS = $derived(
		getCreatableTypes()
			.filter(({ typeId }) => typeId !== 'project')
			.map(({ typeId, info }) => ({
				type: typeId,
				label: info.label,
				icon: info.icon,
				group: info.group ?? 'Other'
			}))
	);

	let selectedType = $state<string | null>(null);
	let name = $state('');
	let notes = $state('');
	let formProps = $state<Record<string, unknown>>({});

	$effect(() => {
		const t = selectedType;
		if (!t) {
			name = '';
			notes = '';
			formProps = {};
			return;
		}
		const typeInfo = TYPE_OPTIONS.find((o) => o.type === t);
		name = typeInfo?.label ?? t;
		notes = '';
		formProps = getCreatableTypes().find((x) => x.typeId === t)?.info.defaultProps ?? {};
	});

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!selectedType || !name.trim()) return;
		onSave(selectedType, name.trim(), notes, formProps);
	}

	function handleOverlayClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('add-modal-overlay')) onCancel();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	}

	const groupList = $derived(
		(() => {
			const map = new Map<string, (typeof TYPE_OPTIONS)[0][]>();
			for (const opt of TYPE_OPTIONS) {
				if (!map.has(opt.group)) map.set(opt.group, []);
				map.get(opt.group)!.push(opt);
			}
			return Array.from(map.entries());
		})()
	);

	let expandedGroups = $state(new Set<string>());

	function toggleGroup(group: string) {
		const next = new Set(expandedGroups);
		if (next.has(group)) next.delete(group);
		else next.add(group);
		expandedGroups = next;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="add-modal-overlay" onclick={handleOverlayClick} role="presentation">
	<div class="add-modal" role="dialog" aria-labelledby="add-modal-title">
		<header class="add-modal-header">
			<h1 id="add-modal-title" class="add-modal-title">Add object</h1>
			<button
				type="button"
				class="add-modal-close"
				aria-label="Close"
				title="Close"
				onclick={onCancel}
			>
				<X size={18} />
			</button>
		</header>
		<div class="add-modal-body">
			<aside class="add-modal-sidebar">
				<nav class="type-list" aria-label="Object types">
					{#each groupList as [groupName, items]}
						{@const open = expandedGroups.has(groupName)}
						<div class="type-group">
							<button
								type="button"
								class="type-group-header"
								aria-expanded={open}
								onclick={() => toggleGroup(groupName)}
							>
								<span class="type-group-chevron">
									{#if open}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
								</span>
								<span class="type-group-name">{groupName}</span>
								<span class="type-group-count">{items.length}</span>
							</button>
							{#if open}
								{#each items as opt}
									{@const Icon = opt.icon ?? LayoutDashboard}
									<button
										type="button"
										class="type-item"
										class:selected={selectedType === opt.type}
										onclick={() => (selectedType = opt.type)}
									>
										<Icon size={16} />
										<span>{opt.label}</span>
									</button>
								{/each}
							{/if}
						</div>
					{/each}
				</nav>
			</aside>
			<main class="add-modal-main">
				{#if !selectedType}
					<div class="add-modal-empty">
						<p>Choose an object type from the list to add.</p>
					</div>
				{:else}
					<form onsubmit={handleSubmit} class="add-modal-form">
						<div class="add-modal-fields">
							<div class="field">
								<label for="add-object-name">Name</label>
								<input
									id="add-object-name"
									type="text"
									bind:value={name}
									required
									placeholder={TYPE_OPTIONS.find((o) => o.type === selectedType)?.label ??
										selectedType}
								/>
							</div>
							<div class="field">
								<label for="add-object-notes">Notes</label>
								<textarea id="add-object-notes" bind:value={notes} rows="2" placeholder="Optional"
								></textarea>
							</div>

							{#if selectedType === 'folder'}
								<FolderProps creationMode={true} />
							{:else if selectedType === 'grid-layout'}
								<GridLayoutProps
									props={formProps as import('$lib/objects/types.js').GridLayoutProps}
									onUpdate={(p) => (formProps = { ...p })}
								/>
							{/if}
						</div>
						<footer class="add-modal-footer">
							<button type="button" class="btn btn-secondary" onclick={onCancel}> Cancel </button>
							<button type="submit" class="btn btn-primary" disabled={saving || !name.trim()}>
								{saving ? 'Creating…' : 'Create'}
							</button>
						</footer>
					</form>
				{/if}
			</main>
		</div>
	</div>
</div>

<style>
	.add-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 3000;
	}
	.add-modal {
		display: flex;
		flex-direction: column;
		min-height: 0;
		width: 720px;
		min-width: 720px;
		max-width: min(720px, 94vw);
		min-height: var(--mcs-modal-min-height);
		max-height: var(--mcs-modal-max-height);
		margin: 1.5rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
	}
	.add-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
	}
	.add-modal-title {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		letter-spacing: 0.02em;
		color: var(--mcs-text);
	}
	.add-modal-close {
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
	.add-modal-close:hover {
		color: var(--mcs-text);
		background: var(--mcs-surface);
	}
	.add-modal-body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.add-modal-sidebar {
		width: 220px;
		flex-shrink: 0;
		border-right: 1px solid var(--mcs-border);
		overflow-y: auto;
		background: var(--mcs-surface-alt);
	}
	.type-list {
		padding: 0.5rem 0;
	}
	.type-group {
		margin-bottom: 0.25rem;
	}
	.type-group-header {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		padding: 0.3rem 0.6rem 0.3rem 0.5rem;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: var(--mcs-radius);
	}
	.type-group-header:hover {
		background: var(--mcs-surface);
	}
	.type-group-chevron {
		display: flex;
		align-items: center;
		color: var(--mcs-text-muted);
		flex-shrink: 0;
	}
	.type-group-name {
		font-size: 0.7rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		flex: 1;
	}
	.type-group-count {
		font-size: 0.65rem;
		color: var(--mcs-text-muted);
		opacity: 0.6;
		font-family: var(--mcs-font-mono);
	}
	.type-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.75rem;
		text-align: left;
		font-size: 0.85rem;
		color: var(--mcs-text);
		background: transparent;
		border: none;
		cursor: pointer;
	}
	.type-item:hover {
		background: var(--mcs-surface);
	}
	.type-item.selected {
		background: var(--mcs-surface);
		color: var(--mcs-accent);
		font-weight: 500;
	}
	.add-modal-main {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 1rem 1.25rem;
	}
	.add-modal-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: 200px;
		color: var(--mcs-text-muted);
		font-size: 0.9rem;
		text-align: center;
		padding: 2rem;
	}
	.add-modal-form {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}
	.add-modal-fields {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 400px;
	}
	.add-modal-fields :global(.chart-props),
	.add-modal-fields :global(.gauge-props),
	.add-modal-fields :global(.grid-layout-props),
	.add-modal-fields :global(.layout-props),
	.add-modal-fields :global(.folder-props) {
		max-width: none;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.field label {
		font-size: 0.78rem;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
	}
	.field input[type='text'],
	.field textarea {
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		border-radius: var(--mcs-radius);
	}
	.add-modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 1rem 0 0;
		margin-top: 1rem;
		border-top: 1px solid var(--mcs-border);
		flex-shrink: 0;
	}
	.btn {
		padding: 0.4rem 0.85rem;
		min-width: 5rem;
		font-size: 0.85rem;
		border-radius: var(--mcs-radius);
		cursor: pointer;
		border: 1px solid;
		box-sizing: border-box;
	}
	.btn-secondary {
		background: var(--mcs-surface-alt);
		border-color: var(--mcs-border);
		color: var(--mcs-text);
	}
	.btn-secondary:hover {
		background: var(--mcs-border);
	}
	.btn-primary {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
		border-color: transparent;
	}
	.btn-primary:hover:not(:disabled) {
		opacity: 0.92;
	}
	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
