<script lang="ts">
	export type RadioOption = {
		value: string;
		label: string;
		description?: string;
		disabled?: boolean;
	};

	let {
		value = $bindable(''),
		options,
		name = 'mcs-radio-group',
		legend,
		disabled = false
	}: {
		value?: string;
		options: RadioOption[];
		name?: string;
		legend?: string;
		disabled?: boolean;
	} = $props();
</script>

<fieldset class="mcs-radio-group" {disabled}>
	{#if legend}<legend>{legend}</legend>{/if}
	<div class="mcs-radio-options">
		{#each options as option}
			<label class="mcs-radio-option" class:disabled={disabled || option.disabled}>
				<input
					type="radio"
					{name}
					value={option.value}
					bind:group={value}
					disabled={disabled || option.disabled}
				/>
				<span class="mcs-radio-copy">
					<span class="mcs-radio-label">{option.label}</span>
					{#if option.description}<span class="mcs-radio-description">{option.description}</span
						>{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	.mcs-radio-group {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.mcs-radio-group legend {
		margin-bottom: var(--mcs-space-2);
		color: var(--mcs-text);
		font-size: 0.78rem;
		font-weight: 600;
	}
	.mcs-radio-options {
		display: grid;
		gap: var(--mcs-space-2);
	}
	.mcs-radio-option {
		display: flex;
		align-items: flex-start;
		gap: var(--mcs-space-2);
		color: var(--mcs-text);
		cursor: pointer;
	}
	.mcs-radio-option input {
		width: auto;
		margin: 0.1rem 0 0;
		accent-color: var(--mcs-accent);
	}
	.mcs-radio-option.disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.mcs-radio-copy {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.mcs-radio-label {
		font-size: 0.8rem;
		line-height: 1.2;
	}
	.mcs-radio-description {
		color: var(--mcs-text-muted);
		font-size: 0.7rem;
		line-height: 1.3;
	}
</style>
