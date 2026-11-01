<svelte:head>
	<title>Project access | MCS</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="access-page">
	<section aria-labelledby="access-title">
		<h1 id="access-title">Project access required</h1>
		<p>
			Your account does not have access to this project. Ask a project administrator to add you.
		</p>
		<a href="/projects">Return to projects</a>
	</section>
</main>

<style>
	.access-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: var(--mcs-bg);
		color: var(--mcs-text);
		font-family: var(--mcs-font-sans);
	}
	section {
		width: min(100%, 28rem);
	}
	h1 {
		margin: 0 0 0.75rem;
		font-size: 1.1rem;
		font-weight: 600;
	}
	p {
		margin: 0 0 1.25rem;
		color: var(--mcs-text-muted);
		line-height: 1.5;
	}
	a {
		color: var(--mcs-text);
		text-underline-offset: 0.18rem;
	}
	a:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 3px;
	}
</style>
