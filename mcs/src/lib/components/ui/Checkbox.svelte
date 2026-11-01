<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		description,
		disabled = false,
		class: className = ''
	}: {
		checked?: boolean;
		label: string;
		description?: string;
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<label class="mcs-checkbox {className}" class:disabled>
	<input type="checkbox" bind:checked {disabled} />
	<span class="mcs-checkbox-copy">
		<span class="mcs-checkbox-label">{label}</span>
		{#if description}<span class="mcs-checkbox-description">{description}</span>{/if}
	</span>
</label>

<style>
	.mcs-checkbox {
		display: inline-flex;
		align-items: flex-start;
		gap: var(--mcs-space-2);
		color: var(--mcs-text);
		cursor: pointer;
	}
	.mcs-checkbox input {
		width: auto;
		margin: 0.1rem 0 0;
		accent-color: var(--mcs-accent);
	}
	.mcs-checkbox.disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.mcs-checkbox-copy {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.mcs-checkbox-label {
		font-size: 0.8rem;
		line-height: 1.2;
	}
	.mcs-checkbox-description {
		color: var(--mcs-text-muted);
		font-size: 0.7rem;
		line-height: 1.3;
	}
</style>
