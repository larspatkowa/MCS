<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const quickStart = `cd mcs
npm install
npm run dev`;

	const dockerStart = `docker compose -f docker/docker-compose.yml up`;

	const globalCli = `npm install -g ./mcs
mcs`;

	const ingestExample = `curl -X POST http://localhost:6000/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "streamId": "demo:temperature",
    "values": { "value": 22.5 }
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Getting started')}</title>
</svelte:head>

<PageHeader
	title="Getting started"
	description="MCS is a local-first telemetry workspace. Create a project, connect a data source, and build views from the project tree."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			MCS runs as a single app. Projects live on disk. You can send data over HTTP or use built-in
			simulations and connectors (still implemented as plugins on the server).
		</p>
	</section>

	<section>
		<h2>Run the app</h2>
		<CodeBlock lang="bash" title="Local setup" code={quickStart} />
		<p>
			Open <a href="http://localhost:6000">http://localhost:6000</a>, create a project, and select
			it. The first screen is the project picker. Use the light/dark toggle in the header to switch
			theme. The picker also supports multi-select deletion with an explicit disk-delete confirmation
			step. After a project opens, MCS loads the tree on the left and the active view in the main
			panel. Use <strong>Ctrl+K</strong> (or <strong>⌘K</strong> on macOS) to open the command palette.
		</p>
		<Callout type="info" title="Explorer defaults">
			The Explorer tree starts fully expanded by default. Your expand/collapse state is remembered per project.
		</Callout>
		<Callout type="tip" title="Port 6000 in use?">
			The dev server defaults to port 6000. If something else is bound there, run
			<code>PORT=7000 npm run dev</code> (or <code>PORT=7000 mcs</code> after a global install), or pass
			<code>-- --port 7000</code> to Vite.
		</Callout>
	</section>

	<section>
		<h2>Global CLI</h2>
		<p>
			From the repository root (after <code>npm install</code>), install the <code>mcs</code> package globally so the
			<code>mcs</code> command starts the dev server from any working directory. Projects still use
			<code>mcs/data/</code> inside this clone.
		</p>
		<CodeBlock lang="bash" title="Global install" code={globalCli} />
	</section>

	<section>
		<h2>Run with Docker</h2>
		<CodeBlock lang="bash" title="Docker setup" code={dockerStart} />
		<p>
			Open <a href="http://localhost:6000">http://localhost:6000</a>. Projects persist in the repo’s
			<code>mcs/data/</code> folder (bind-mounted into the container).
		</p>
	</section>

	<section>
		<h2>See live data quickly</h2>
		<ol>
			<li>
				On a fresh install with no recent projects, MCS creates a <strong>Rocket Mission Demo</strong> project
				and auto-starts the rocket simulation when you open it.
			</li>
			<li>
				From the project picker, under <strong>Create project</strong>, open <strong>Example projects</strong> and pick
				<strong>Rocket Mission</strong>, <strong>Agriculture</strong>, or <strong>System Monitor</strong>.
			</li>
			<li>
				With a project open, select the project root in the tree. That screen gives an overview of sources, stream IDs,
				and the objects scaffolded for the project.
			</li>
			<li>
				For start/stop and auto-start, open <strong>Settings → Data sources</strong> (built-in simulations and
				external connectors).
			</li>
			<li>Open scaffolded folders in the tree to inspect the objects a simulation created.</li>
		</ol>
		<Callout type="info" title="Interactive tour">
			Use <strong>Take a project tour</strong> from the project root screen. Example projects tailor the copy; other
			projects use the generic tour.
		</Callout>
		<p>
			If you want the full mental model for those walkthroughs, start with
			<a href="/tutorials/example-projects">Example projects</a>.
		</p>
		<Callout type="tip" title="Gallery">
			Use the app’s <code>/gallery</code> route when you want to preview the built-in object types
			with sample data. The gallery matches the main workspace look (flat panels, no extra showcase
			chrome around the preview). Click <strong>MCS</strong> in the top bar while inside a project, or
			<strong>MCS</strong> in the gallery sidebar header, to return to the all-projects screen.
		</Callout>
	</section>

	<section>
		<h2>Core ideas</h2>
		<table>
			<thead>
				<tr><th>Concept</th><th>Meaning</th></tr>
			</thead>
			<tbody>
				<tr><td>Project</td><td>A folder that contains <code>project.json</code> and <code>mcs.db</code>.</td></tr>
				<tr><td>Object</td><td>A tree node such as a folder, layout, plot, map, gauge, or note.</td></tr>
				<tr><td>Stream</td><td>A named telemetry channel with timestamped JSON samples.</td></tr>
				<tr><td>Data source</td><td>Built-in simulation, spawned connector, or your own HTTP client posting to ingest.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Send your own data</h2>
		<p>
			If you already have a project and just need to push samples into it, start with the ingest
			endpoint. MCS creates the stream the first time data arrives if it does not exist yet.
		</p>
		<CodeBlock lang="bash" title="Ingest request" code={ingestExample} />
		<p>
			For stream names, units, min/max ranges, and limit thresholds, use
			<a href="/api/streams">stream declaration and limits</a> or a built-in simulation.
		</p>
	</section>

	<section>
		<h2>Next steps</h2>
		<ul>
			<li><a href="/tutorials/example-projects">Walk through the built-in example projects</a>.</li>
			<li><a href="/components">Review the current object types</a> exposed by the Add Object modal.</li>
			<li><a href="/plugins">Inspect data sources</a> (simulations, connectors, and the plugin API).</li>
			<li><a href="/tutorials/first-plugin">Write your first plugin</a>.</li>
			<li><a href="/api/ingest">Use the API directly</a> from hardware, scripts, or another service.</li>
		</ul>
	</section>
</article>
