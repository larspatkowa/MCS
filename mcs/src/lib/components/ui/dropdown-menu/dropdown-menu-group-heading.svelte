<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DropdownMenuPrimitive.GroupHeadingProps = $props();
</script>

<DropdownMenuPrimitive.GroupHeading
	bind:ref
	class={cn(
		'px-2 py-1.5 text-xs font-semibold text-muted-foreground section-heading-mono',
		className
	)}
	{...restProps}
/>

<style>
	:global(.section-heading-mono) {
		font-family: var(--mcs-font-mono);
	}
</style>
