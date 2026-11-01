<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const quickStart = `git clone https://github.com/larspatkowa/MCS.git
cd MCS
npm ci
npm run dev`;

	const repositoryChecks = `npm run check
npm run build`;

	const ingestExample = `curl -X POST http://127.0.0.1:8080/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "streamId": "sensor:temperature",
    "values": { "value": 22.5, "sensor": "payload-bay" }
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Getting started')}</title>
</svelte:head>

<PageHeader
	title="Get started with MCS"
	description="Run MCS, explore a working telemetry project, or connect your own source."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			MCS keeps projects on your machine. Each project holds a tree of views and the timestamped
			data behind them. Start with the path that fits what you are here to do.
		</p>
		<nav class="start-options" aria-label="Common tasks">
			<a class="start-card" href="#run-mcs">
				<span class="card-title">Run MCS</span>
				<span class="card-description">Start the app from the source repository.</span>
				<span class="card-action">Setup steps <span aria-hidden="true">→</span></span>
			</a>
			<a class="start-card" href="/guides/flight-system">
				<span class="card-title">Explore flight data</span>
				<span class="card-description">Open a ready-made project with sample telemetry.</span>
				<span class="card-action">Flight system starter <span aria-hidden="true">→</span></span>
			</a>
			<a class="start-card" href="#send-your-own-data">
				<span class="card-title">Send a sample</span>
				<span class="card-description">Post one reading to a project over HTTP.</span>
				<span class="card-action">Ingest example <span aria-hidden="true">→</span></span>
			</a>
			<a class="start-card" href="/components/line-plot">
				<span class="card-title">Build a plot</span>
				<span class="card-description">Choose stream fields and display them over time.</span>
				<span class="card-action">Line plot guide <span aria-hidden="true">→</span></span>
			</a>
		</nav>
	</section>

	<section id="run-mcs">
		<h2>Run MCS</h2>
		<p>
			Node.js 22 or newer is required. The <code>create-mcs</code> and
			<code>mcs-platform</code> packages are prepared but not published yet, so use the repository:
		</p>
		<CodeBlock lang="bash" title="Run from source" code={quickStart} />
		<p>
			Open <code>http://127.0.0.1:8080/projects</code> to create or open a project. MCS stores its
			manifest and SQLite database in that project folder. Once it opens, select an object in the
			tree to view it.
		</p>
		<Callout type="info" title="Explorer tree">
			The tree starts fully expanded. MCS remembers your expand and collapse state for each project.
		</Callout>
	</section>

	<section id="send-your-own-data">
		<h2>Send a sample</h2>
		<ol>
			<li>In MCS, open <code>http://127.0.0.1:8080/projects</code> and create a project.</li>
			<li>Copy the project ID from the address after <code>/project/</code>.</li>
			<li>Replace <code>YOUR_PROJECT_ID</code> below and run the request.</li>
		</ol>
		<CodeBlock lang="bash" title="Send one temperature reading" code={ingestExample} />
		<p>
			MCS creates <code>sensor:temperature</code> when the first sample arrives. With no timestamp
			provided, it uses the server's current time. Add stream units and limits through
			<a href="/api/streams">Streams and limits</a>.
		</p>
		<Callout type="tip" title="Already have a data source?">
			For batches, source clocks, sequence numbers, and quality fields, see the
			<a href="/api/ingest">ingest API reference</a>.
		</Callout>
	</section>

	<section>
		<h2>How a project is organized</h2>
		<table>
			<thead>
				<tr><th>Term</th><th>In MCS</th></tr>
			</thead>
			<tbody>
				<tr><td>Project</td><td>A folder containing the workspace, <code>project.json</code>, and <code>mcs.db</code>.</td></tr>
				<tr><td>Object</td><td>A tree item, such as a folder, plot, gauge, table, or note.</td></tr>
				<tr><td>Stream</td><td>A named channel of timestamped samples, such as temperature readings.</td></tr>
				<tr><td>Run</td><td>A bounded recording that you can replay against one timeline.</td></tr>
			</tbody>
		</table>
		<p><a href="/concepts">Read the full concepts guide</a> for sources, event time, and project storage.</p>
	</section>

	<section>
		<h2>Record and replay a run</h2>
		<p>
			For a test or flight session, start a recording before data arrives. MCS groups those samples
			into a run that can be replayed and exported later.
		</p>
		<p><a href="/guides/runs">Follow the run recording guide</a> or browse the <a href="/api/runs">runs API</a>.</p>
	</section>

	<section>
		<h2>Working on MCS</h2>
		<p>From the repository root, these commands check the source and build the application and docs.</p>
		<CodeBlock lang="bash" title="Check and build" code={repositoryChecks} />
	</section>
</article>

<style>
	.start-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
		margin-top: 0.15rem;
		padding: 0;
		list-style: none;
	}

	.start-card {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--docs-border);
		border-radius: var(--docs-radius);
		background: var(--docs-surface-strong);
		color: var(--docs-text);
		text-decoration: none;
	}

	.start-card:hover {
		border-color: var(--docs-border-strong);
		background: var(--docs-surface);
		color: var(--docs-text);
	}

	.card-title {
		font-size: 0.98rem;
		font-weight: 600;
		line-height: 1.35;
	}

	.card-description {
		color: var(--docs-text-muted);
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.card-action {
		margin-top: 0.2rem;
		color: var(--docs-text);
		font-size: 0.82rem;
		font-weight: 500;
	}

	@media (max-width: 600px) {
		.start-options {
			grid-template-columns: 1fr;
		}
	}
</style>
