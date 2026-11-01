<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let setupRequired = $state(false);
	let displayName = $state('');
	let email = $state('');
	let password = $state('');
	let bootstrapToken = $state('');
	let error = $state('');
	let busy = $state(false);

	onMount(async () => {
		const response = await fetch('/api/auth/session');
		if (!response.ok) return;
		const session = await response.json();
		setupRequired = session.setupRequired;
		if (session.authenticated) goto('/projects');
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		try {
			const next = $page.url.searchParams.get('next');
			const response = await fetch(setupRequired ? '/api/auth/bootstrap' : '/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					setupRequired ? { bootstrapToken, displayName, email, password } : { email, password }
				)
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error ?? 'Sign in failed');
			const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/projects';
			await goto(destination);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Sign in failed';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{setupRequired ? 'Set up MCS | MCS' : 'Sign in | MCS'}</title>
</svelte:head>

<main class="auth-page">
	<form class="auth-form" onsubmit={submit}>
		<h1>{setupRequired ? 'Create administrator' : 'Sign in to MCS'}</h1>
		<p>
			{setupRequired
				? 'Set up the first account for this MCS service.'
				: 'Use your MCS account to continue.'}
		</p>
		{#if setupRequired}
			<label>
				Administrator setup token
				<input bind:value={bootstrapToken} type="password" autocomplete="off" required />
			</label>
			<label>
				Display name
				<input bind:value={displayName} autocomplete="name" required />
			</label>
		{/if}
		<label>
			Email
			<input bind:value={email} type="email" autocomplete="username" required />
		</label>
		<label>
			Password
			<input
				bind:value={password}
				type="password"
				autocomplete={setupRequired ? 'new-password' : 'current-password'}
				required
			/>
		</label>
		{#if setupRequired}<p class="hint">Use at least 12 characters.</p>{/if}
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button type="submit" disabled={busy}
			>{busy ? 'Please wait…' : setupRequired ? 'Create account' : 'Sign in'}</button
		>
	</form>
</main>

<style>
	.auth-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1rem;
		box-sizing: border-box;
		color: var(--mcs-text, #1a1a1a);
		background: var(--mcs-bg, #f5f5f5);
	}
	.auth-form {
		width: min(100%, 24rem);
		display: grid;
		gap: 0.85rem;
		padding: 1.25rem;
		border: 1px solid var(--mcs-border, #ccc);
		border-radius: var(--mcs-radius, 0.375rem);
		background: var(--mcs-surface, #fff);
	}
	h1 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 600;
	}
	.auth-form > p {
		margin: 0;
		color: var(--mcs-text-muted, #666);
	}
	label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.82rem;
	}
	input {
		min-height: 2.4rem;
		padding: 0.4rem 0.55rem;
		border: 1px solid var(--mcs-border, #ccc);
		border-radius: var(--mcs-radius, 0.375rem);
		background: var(--mcs-bg, #f5f5f5);
		color: var(--mcs-text, #1a1a1a);
		font: inherit;
	}
	input:focus-visible,
	button:focus-visible {
		outline: 2px solid var(--mcs-accent, #1a1a1a);
		outline-offset: 2px;
	}
	button {
		min-height: 2.4rem;
		border: 1px solid var(--mcs-accent, #1a1a1a);
		border-radius: var(--mcs-radius, 0.375rem);
		background: var(--mcs-accent, #1a1a1a);
		color: var(--mcs-bg, #fff);
		font: inherit;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.hint {
		font-size: 0.75rem;
	}
	.error {
		color: var(--mcs-danger, #222);
		font-size: 0.85rem;
	}
</style>
