<script lang="ts">
	let { children } = $props<{ children: import('svelte').Snippet }>();

	let error = $state<Error | null>(null);

	// In Svelte 5, $effect is used to catch errors during render. However,
	// Svelte 5 error boundaries aren't quite built-in the same way as React's.
	// We can try/catch within our logic or rely on SvelteKit's +error.svelte for routing errors.
	// For component-level errors, there's no native `<svelte:boundary>`.
	// We will implement a visual fallback container here that can be used manually
	// or provide a consistent error UI for caught errors.

	export function handleError(e: Error) {
		error = e;
	}

	export function reset() {
		error = null;
	}
</script>

{#if error}
	<div class="mcs-error-boundary">
		<div class="mcs-error-content">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="mcs-error-icon"
				><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path
					d="M12 9v4"
				/><path d="M12 17h.01" /></svg
			>
			<h3>View Error</h3>
			<p>{error.message}</p>
			<button class="mcs-btn" onclick={reset}>Dismiss</button>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.mcs-error-boundary {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background: var(--mcs-bg-inset, #1a1b1e);
		color: var(--mcs-text-muted, #9ca3af);
		padding: 1rem;
		border-radius: var(--mcs-radius-md, 4px);
		box-sizing: border-box;
	}
	.mcs-error-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.5rem;
		max-width: 300px;
	}
	.mcs-error-icon {
		color: var(--mcs-danger, #222222);
		margin-bottom: 0.25rem;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--mcs-text, #f3f4f6);
	}
	p {
		margin: 0;
		font-size: 0.85rem;
		opacity: 0.8;
	}
	.mcs-btn {
		margin-top: 0.5rem;
		background: var(--mcs-btn-bg, #374151);
		color: var(--mcs-text, #f3f4f6);
		border: 1px solid var(--mcs-border, #4b5563);
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.mcs-btn:hover {
		background: var(--mcs-btn-hover, #4b5563);
	}
</style>
