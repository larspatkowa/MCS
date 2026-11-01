<script lang="ts">
	let { issue }: { issue?: string } = $props();
</script>

<svelte:head>
	<title>MCS | No project</title>
	<meta name="description" content="Open an MCS project from the command line." />
</svelte:head>

<main class="no-project-screen" data-testid="no-project-screen">
	<section class="no-project-content" aria-labelledby="no-project-title">
		<h1 id="no-project-title">Open a project from the command line</h1>
		<p class="intro">Use the CLI to create or open a project.</p>

		{#if issue}
			<p class="issue" role="alert">
				{issue} Run <code>mcs doctor .</code> or <code>mcs upgrade .</code> in the project directory.
			</p>
		{/if}

		<div class="commands" aria-label="MCS commands">
			<div class="command-row">
				<span class="command-label">Create</span>
				<code>mcs create my-project</code>
			</div>
			<div class="command-row">
				<span class="command-label">Open</span>
				<code>mcs open my-project</code>
			</div>
		</div>

		<a class="manager-link" href="/projects">Open project manager</a>
	</section>
</main>

<style>
	.no-project-screen {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background: var(--mcs-bg);
		color: var(--mcs-text);
	}

	.no-project-content {
		width: min(100%, 800px);
	}

	h1 {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.25;
		color: var(--mcs-text);
	}

	.intro {
		margin: 0.5rem 0 0;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--mcs-text-muted);
	}

	.commands {
		width: min(100%, 28rem);
		margin-top: 1.5rem;
		border-top: 1px solid var(--mcs-border);
	}

	.command-row {
		display: grid;
		grid-template-columns: 4.5rem 1fr;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--mcs-border);
	}

	.command-label {
		font: 600 0.7rem/1.2 var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}

	code {
		font: 0.82rem/1.4 var(--mcs-font-mono);
		color: var(--mcs-text);
	}

	.issue {
		max-width: 34rem;
		margin: 1rem 0 0;
		color: var(--mcs-text-muted);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.issue code {
		font-size: 0.78rem;
	}

	.manager-link {
		display: inline-block;
		margin-top: 1.5rem;
		color: var(--mcs-accent);
		font-size: 0.875rem;
		text-decoration: none;
	}

	.manager-link:hover {
		text-decoration: underline;
	}

	.manager-link:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 3px;
	}
</style>
