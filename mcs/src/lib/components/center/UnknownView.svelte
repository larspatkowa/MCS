<script lang="ts">
	let { typeId }: { typeId: string } = $props();
</script>

<div class="unknown-view">
	<p>Unknown type: {typeId}</p>
	<p class="hint">Register a view for this type in the object-types registry to display it here.</p>
</div>

<style>
	.unknown-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--mcs-text-muted);
		font-size: 0.9rem;
		text-align: center;
		padding: 1rem;
	}
	.unknown-view .hint {
		font-size: 0.8rem;
		margin-top: 0.5rem;
		opacity: 0.9;
	}
</style>
