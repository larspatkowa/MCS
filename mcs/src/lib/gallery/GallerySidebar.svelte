<script lang="ts">
	import { getGalleryCatalog } from '$lib/gallery/catalog.js';
	import { getType } from '$lib/object-types/registry.js';

	let { currentType, currentVariant }: { currentType: string; currentVariant: string } = $props();

	const catalog = getGalleryCatalog();
	const groupedCatalog = $derived.by(() => {
		const groups = new Map<
			string,
			Map<
				string,
				{
					typeLabel: string;
					entries: typeof catalog;
				}
			>
		>();

		for (const entry of catalog) {
			const typeInfo = getType(entry.typeId);
			const groupLabel = typeInfo?.group ?? 'Other';
			const typeLabel = typeInfo?.label ?? entry.typeId;
			const group = groups.get(groupLabel) ?? new Map();
			const typeGroup = group.get(entry.typeId) ?? { typeLabel, entries: [] };
			typeGroup.entries.push(entry);
			group.set(entry.typeId, typeGroup);
			groups.set(groupLabel, group);
		}

		return [...groups.entries()].map(([groupLabel, typeMap]) => ({
			groupLabel,
			types: [...typeMap.entries()].map(([typeId, value]) => ({
				typeId,
				typeLabel: value.typeLabel,
				entries: value.entries
			}))
		}));
	});
</script>

<nav class="gallery-sidebar" aria-label="Component gallery">
	<div class="gallery-sidebar-header">
		<a href="/" class="gallery-home-brand" aria-label="MCS — all projects" title="All projects"
			>MCS</a
		>
		<span class="gallery-header-sep" aria-hidden="true">/</span>
		<span class="gallery-sidebar-label">Gallery</span>
	</div>
	<div class="gallery-sidebar-scroll">
		{#each groupedCatalog as group}
			<section class="gallery-group">
				<h3 class="gallery-group-title">{group.groupLabel}</h3>
				{#each group.types as type}
					<div class="gallery-type">
						<div class="gallery-type-label">
							<span>{type.typeLabel}</span>
							<span class="gallery-type-count">{type.entries.length}</span>
						</div>
						<ul class="gallery-variant-list">
							{#each type.entries as entry}
								<li>
									<a
										href="/gallery/{entry.typeId}/{entry.variantId}"
										class="gallery-variant-link"
										class:active={currentType === entry.typeId &&
											currentVariant === entry.variantId}
										aria-current={currentType === entry.typeId && currentVariant === entry.variantId
											? 'page'
											: undefined}
									>
										{entry.label ?? entry.variantId}
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</section>
		{/each}
	</div>
</nav>

<style>
	.gallery-sidebar {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		background: var(--mcs-surface);
	}
	.gallery-sidebar-header {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		height: var(--mcs-header-height);
		min-height: var(--mcs-header-height);
		padding: 0 var(--mcs-header-action-inset);
		font-size: 0.75rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		border-bottom: 1px solid var(--mcs-border);
		flex-shrink: 0;
		min-width: 0;
	}
	.gallery-home-brand {
		flex-shrink: 0;
		font-weight: 700;
		font-family: inherit;
		color: var(--mcs-text);
		text-decoration: none;
		border-radius: var(--mcs-radius);
		padding: 0.15rem 0.2rem;
		margin: -0.15rem -0.2rem;
	}
	.gallery-home-brand:hover {
		color: var(--mcs-accent);
	}
	.gallery-home-brand:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.gallery-header-sep {
		flex-shrink: 0;
		opacity: 0.5;
		user-select: none;
	}
	.gallery-sidebar-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.gallery-sidebar-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding-right: max(1rem, 12px);
	}
	.gallery-group {
		padding: 0.5rem 0 0.65rem;
	}
	.gallery-group + .gallery-group {
		border-top: 1px solid var(--mcs-border);
	}
	.gallery-group-title {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0;
		padding: 0.35rem var(--mcs-header-action-inset) 0.25rem;
		font-size: 0.72rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		background: var(--mcs-surface);
	}
	.gallery-type {
		margin-top: 0.35rem;
	}
	.gallery-type:first-of-type {
		margin-top: 0.15rem;
	}
	.gallery-type-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.2rem var(--mcs-header-action-inset) 0.15rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--mcs-text-muted);
	}
	.gallery-type-count {
		font-family: var(--mcs-font-mono);
		font-weight: 500;
		color: var(--mcs-text-muted);
		opacity: 0.85;
	}
	.gallery-variant-list {
		list-style: none;
		margin: 0;
		padding: 0;
		margin-left: 1rem;
		border-left: 1px solid var(--mcs-border);
	}
	.gallery-variant-list li {
		margin: 0;
		padding: 0;
	}
	.gallery-variant-link {
		display: block;
		padding: 0.25rem 0.75rem;
		font-size: 0.85rem;
		color: var(--mcs-text);
		text-decoration: none;
		transition: background 120ms ease;
	}
	.gallery-variant-link:hover {
		background: var(--mcs-surface-alt);
	}
	.gallery-variant-link.active {
		background: var(--mcs-surface-alt);
	}
</style>
