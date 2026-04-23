<script lang="ts">
	import { untrack } from 'svelte';
	import type { GridLayoutProps } from '$lib/objects/types.js';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';
	import PropCheckbox from './PropCheckbox.svelte';

	let { props, onUpdate } = $props<{
		props: GridLayoutProps;
		onUpdate?: (props: GridLayoutProps) => void;
	}>();

	let localProps = $state<GridLayoutProps>(untrack(() => ({ ...props })));

	// Re-sync when parent selects a different object (same component reused)
	$effect(() => {
		localProps = { ...props } as GridLayoutProps;
	});

	function update(key: keyof GridLayoutProps, value: unknown) {
		localProps = { ...localProps, [key]: value };
		onUpdate?.(localProps);
	}
</script>

<div class="grid-layout-props">
	<PropSection title="Grid" id="grid-layout-grid" open={true}>
		<PropRow label="Horizontal grid size (px)">
			<PropNumber
				value={(localProps.gridSize?.[0] as number) ?? 10}
				min={1}
				onChange={(v) => update('gridSize', [v ?? 10, localProps.gridSize?.[1] ?? 10])}
			/>
		</PropRow>
		<PropRow label="Vertical grid size (px)">
			<PropNumber
				value={(localProps.gridSize?.[1] as number) ?? 10}
				min={1}
				onChange={(v) => update('gridSize', [localProps.gridSize?.[0] ?? 10, v ?? 10])}
			/>
		</PropRow>
	</PropSection>
	<PropSection title="Canvas" id="grid-layout-canvas" advanced={true}>
		<PropRow label="Width (px, optional)">
			<PropNumber
				value={(localProps.dimensions?.[0] as number) ?? undefined}
				placeholder="Auto"
				onChange={(v) =>
					update('dimensions', v != null ? [v, localProps.dimensions?.[1] ?? 0] : undefined)}
			/>
		</PropRow>
		<PropRow label="Height (px, optional)">
			<PropNumber
				value={(localProps.dimensions?.[1] as number) ?? undefined}
				placeholder="Auto"
				onChange={(v) =>
					update('dimensions', v != null ? [localProps.dimensions?.[0] ?? 0, v] : undefined)}
			/>
		</PropRow>
		<PropRow label="Scale to fit">
			<PropCheckbox
				checked={(localProps.scaleToFit as boolean) ?? true}
				label="Scale to fit available center area"
				onChange={(v) => update('scaleToFit', v)}
			/>
		</PropRow>
	</PropSection>
</div>

<style>
	.grid-layout-props {
		display: flex;
		flex-direction: column;
	}
</style>
