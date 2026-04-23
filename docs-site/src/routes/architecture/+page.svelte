<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';
	import { docTitle } from '$lib/nav.js';

	const architectureDiagram = `flowchart TD
    UI["Browser UI"]
    REST["REST API routes"]
    Projects["projects / objects / streams"]
    Ingest["performIngest()"]
    SQLite[("SQLite")]
    SSE["SSE broadcasts"]
    Plugins["Plugin system (Data sources UI)"]
    External["External process"]

    UI --> REST
    REST --> Projects
    REST --> Ingest
    Plugins --> Ingest
    External -->|"POST /api/ingest"| REST
    Projects --> SQLite
    Ingest --> SQLite
    Ingest --> SSE
    SSE --> UI`;
</script>

<svelte:head>
	<title>{docTitle('Architecture')}</title>
</svelte:head>

<PageHeader
	title="Architecture"
	description="The main runtime path in MCS is browser UI to REST routes to SQLite and SSE. Simulations and connectors (Data sources in the UI) use the plugin registry: they either call the same ingest path directly or reach it over HTTP."
/>

<article class="doc-page">
	<section>
		<MermaidDiagram
			diagram={architectureDiagram}
			caption="Validated against the current REST routes, ingest core, plugin registry, and SSE endpoints."
		/>
	</section>

	<section>
		<h2>Client</h2>
		<p>
			The app is a SvelteKit frontend. The home route shows the project picker: <strong>Open project</strong>
			and <strong>Create project</strong> share one grid row so both panels match height, and the recent list
			scrolls inside its panel with end padding kept inside the scroll region. Create actions disable their
			controls while requests run instead of swapping in extra status copy. The project route loads the
			manifest, object tree, and current view, then subscribes to project and telemetry event streams.
		</p>
	</section>

	<section>
		<h2>Server</h2>
		<p>
			Server modules under <code>mcs/src/lib/server</code> handle project manifests, SQLite access,
			stream metadata, annotations, limits, and plugin execution. The API routes are thin wrappers
			over those modules.
		</p>
	</section>

	<section>
		<h2>Ingest path</h2>
		<p>
			Every sample eventually flows through <code>performIngest(projectId, streamId, timestamp, values)</code>.
			That function resolves the project path, stores the sample, evaluates configured limits, and
			broadcasts stream or limit events over SSE.
		</p>
	</section>

	<section>
		<h2>Data sources (plugin path)</h2>
		<p>
			In-process simulations receive a <code>ctx.ingest()</code> callback. External connectors are started
			as Node or Python processes and receive <code>MCS_API_URL</code> and <code>MCS_PROJECT_ID</code>
			in their environment so they can call the same HTTP API.
		</p>
		<Callout type="info" title="Two SSE channels">
			Project structure changes come from <code>/api/projects/:id/changes</code>. Telemetry samples
			and limit events come from <code>/api/projects/:id/streams/events</code>.
		</Callout>
	</section>

	<section>
		<h2>End-to-end test data</h2>
		<p>
			The Playwright E2E suite creates temporary projects under <code>data/projects</code> and deletes their
			folders during teardown so local runs and CI don't leave project directories behind.
		</p>
	</section>
</article>
