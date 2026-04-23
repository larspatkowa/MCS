<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: DropdownMenuPrimitive.GroupProps = $props();
</script>

<DropdownMenuPrimitive.Group
	bind:ref
	class={cn('flex flex-col gap-0.5 p-1', className)}
	{...restProps}
/>
