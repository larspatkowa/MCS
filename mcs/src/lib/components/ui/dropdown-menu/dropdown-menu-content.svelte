<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DropdownMenuPrimitive.ContentProps = $props();
</script>

<DropdownMenuPrimitive.Content
	bind:ref
	class={cn(
		'mcs-dropdown-content z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md focus:outline-none',
		className
	)}
	{...restProps}
/>

<style>
	:global(.mcs-dropdown-content) {
		animation: mcs-dropdown-enter 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes mcs-dropdown-enter {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
