<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';
	import '$lib/styles/theme.css';
	import '$lib/styles/tailwind.css';
	import { bootstrapObjectTypes } from '$lib/object-types/bootstrap.js';
	import { theme } from '$lib/stores/theme';

	bootstrapObjectTypes();

	let { children } = $props();

	afterNavigate(() => {
		window.scrollTo(0, 0);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
