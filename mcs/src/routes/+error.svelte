<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import '$lib/styles/theme.css';

	const message = $derived(
		$page.error?.message ?? $page.error?.toString() ?? 'Something went wrong'
	);
	const status = $derived($page.status ?? 500);
	const errorDetails = $derived($page.error ? JSON.stringify($page.error, null, 2) : '');

	function handleBackClick(e: MouseEvent) {
		e.preventDefault();
		goto('/projects');
	}
</script>

<div class="wrap">
	<div class="card">
		<p class="status">{status}</p>
		<p class="message">{message}</p>
		{#if errorDetails && errorDetails !== '{}'}
			<details class="error-details">
				<summary>Error details</summary>
				<pre>{errorDetails}</pre>
			</details>
		{/if}
		<a href="/projects" onclick={handleBackClick} class="link">Back to project manager</a>
	</div>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: var(--mcs-bg);
	}
	.card {
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: 4px;
		padding: 1.5rem 2rem;
		max-width: 360px;
	}
	.status {
		font-size: 0.8rem;
		font-weight: 600;
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
		margin: 0 0 0.25rem;
	}
	.message {
		color: var(--mcs-text);
		font-size: 0.95rem;
		margin: 0 0 1rem;
		line-height: 1.4;
	}
	.link {
		font-size: 0.9rem;
		color: var(--mcs-accent);
		text-decoration: none;
	}
	.link:hover {
		text-decoration: underline;
	}
	.error-details {
		margin-top: 1rem;
		font-size: 0.8rem;
	}
	.error-details summary {
		cursor: pointer;
		color: var(--mcs-text-muted);
		margin-bottom: 0.5rem;
	}
	.error-details pre {
		background: var(--mcs-surface-alt);
		padding: 0.5rem;
		border-radius: 2px;
		overflow: auto;
		font-size: 0.75rem;
		max-height: 200px;
	}
</style>
