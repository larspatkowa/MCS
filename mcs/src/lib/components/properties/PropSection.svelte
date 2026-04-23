<script lang="ts">
	import { selectedObject } from '$lib/stores/project';
	import { propertyPanelMode } from '$lib/stores/property-panel';
	import type { Snippet } from 'svelte';
	let {
		title,
		id = '',
		open = false,
		persistKey = '',
		advanced = false,
		children
	}: {
		title: string;
		id?: string;
		open?: boolean;
		persistKey?: string;
		advanced?: boolean;
		children?: Snippet;
	} = $props();

	const shouldPersist = $derived(Boolean(persistKey && id));

	const scopeKey = $derived(
		shouldPersist && persistKey === 'mcs-props-section' ? ($selectedObject?.type ?? 'unknown') : ''
	);

	const storageKey = $derived(
		shouldPersist ? `${persistKey}${scopeKey ? `-${scopeKey}` : ''}-${id}` : ''
	);

	const hiddenByMode = $derived(advanced && $propertyPanelMode === 'essentials');

	let expanded = $state(false);

	function getStorage(): Storage | null {
		if (typeof window === 'undefined') return null;
		const storage = window.localStorage as Storage | undefined;
		if (!storage) return null;
		if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null;
		return storage;
	}

	function syncExpanded(next: boolean) {
		expanded = next;
		const storage = getStorage();
		if (shouldPersist && storageKey && storage) {
			storage.setItem(storageKey, String(next));
		}
	}

	$effect(() => {
		const storage = getStorage();
		if (!shouldPersist || !storageKey || !storage) {
			expanded = open;
			return;
		}
		const stored = storage.getItem(storageKey);
		expanded = stored == null ? open : stored !== 'false';
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const onCollapse = () => syncExpanded(false);
		const onExpand = () => syncExpanded(true);
		window.addEventListener('mcs-props-collapse-all', onCollapse as EventListener);
		window.addEventListener('mcs-props-expand-all', onExpand as EventListener);
		return () => {
			window.removeEventListener('mcs-props-collapse-all', onCollapse as EventListener);
			window.removeEventListener('mcs-props-expand-all', onExpand as EventListener);
		};
	});

	function toggle() {
		syncExpanded(!expanded);
	}
</script>

{#if !hiddenByMode}
	<div class="prop-section">
		<button
			type="button"
			class="prop-section-header"
			onclick={toggle}
			aria-expanded={expanded}
			aria-controls={id ? `section-${id}` : undefined}
			id={id ? `section-${id}` : undefined}
		>
			<span class="prop-section-title">{title}</span>
			<span class="prop-section-chevron" aria-hidden="true">{expanded ? '\u25BC' : '\u25B6'}</span>
		</button>
		{#if expanded}
			<div
				class="prop-section-body"
				role="region"
				aria-labelledby={id ? `section-${id}` : undefined}
			>
				{@render children?.()}
			</div>
		{/if}
	</div>
{/if}

<style>
	.prop-section {
		border-bottom: 1px solid var(--mcs-border);
	}
	.prop-section:last-child {
		border-bottom: none;
	}
	.prop-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		background: var(--mcs-surface);
		border: none;
		cursor: pointer;
		text-align: left;
	}
	.prop-section-header:hover {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.prop-section-title {
		flex: 1;
	}
	.prop-section-chevron {
		font-size: 0.65rem;
		opacity: 0.8;
	}
	.prop-section-body {
		padding: 0.5rem 0.75rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--mcs-surface-alt);
	}
</style>
