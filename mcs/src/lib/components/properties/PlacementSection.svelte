<script lang="ts">
	import type { GridLayoutItem } from '$lib/objects/types.js';
	import { selectedObjectId, selectedLayoutContext } from '$lib/stores/project';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';

	let {
		layoutObjectId,
		item,
		onUpdate
	}: {
		layoutObjectId: string;
		item: GridLayoutItem;
		onUpdate: (
			itemId: string,
			patch: Partial<Pick<GridLayoutItem, 'x' | 'y' | 'width' | 'height'>>
		) => void;
	} = $props();

	function editObject() {
		selectedLayoutContext.set(null);
		selectedObjectId.set(item.objectId);
	}
</script>

<PropSection title="Placement" id="placement-section" open={true}>
	<PropRow label="X (grid)">
		<PropNumber value={item.x} min={0} onChange={(v) => onUpdate(item.id, { x: v ?? 0 })} />
	</PropRow>
	<PropRow label="Y (grid)">
		<PropNumber value={item.y} min={0} onChange={(v) => onUpdate(item.id, { y: v ?? 0 })} />
	</PropRow>
	<PropRow label="Width (grid)">
		<PropNumber value={item.width} min={1} onChange={(v) => onUpdate(item.id, { width: v ?? 1 })} />
	</PropRow>
	<PropRow label="Height (grid)">
		<PropNumber
			value={item.height}
			min={1}
			onChange={(v) => onUpdate(item.id, { height: v ?? 1 })}
		/>
	</PropRow>
	<div class="placement-actions">
		<button type="button" class="edit-object-btn" onclick={editObject}>Edit embedded object</button>
	</div>
</PropSection>

<style>
	.placement-actions {
		margin-top: 0.5rem;
	}
	.edit-object-btn {
		font-size: 0.8rem;
		padding: 0.35rem 0.5rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-accent);
		border-radius: var(--mcs-radius);
		cursor: pointer;
		width: 100%;
		text-align: left;
	}
	.edit-object-btn:hover {
		background: var(--mcs-surface-alt);
	}
</style>
