<script lang="ts">
	import NoProjectScreen from '$lib/components/picker/NoProjectScreen.svelte';

	let { data } = $props<{
		data: {
			defaultProjectUnavailable?: boolean;
			defaultProjectIssue?: string;
		};
	}>();
</script>

<NoProjectScreen issue={data.defaultProjectUnavailable ? data.defaultProjectIssue : undefined} />
