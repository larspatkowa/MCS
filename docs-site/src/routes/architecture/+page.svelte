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
	Adapter["External acquisition adapter"]

    UI --> REST
    REST --> Projects
    REST --> Ingest
	Adapter -->|"POST /api/ingest"| REST
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
	description="The main runtime path in MCS is browser UI to REST routes to SQLite and SSE. External acquisition systems send normalized samples or import run packages through narrow data boundaries."
/>

<article class="doc-page">
	<section>
		<MermaidDiagram
			diagram={architectureDiagram}
			caption="Validated against the current REST routes, ingest core, run import, and SSE endpoints."
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
			stream metadata, annotations, limits, run storage, and media. The API routes are thin wrappers
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
		<h2>External acquisition</h2>
		<p>
			MCS does not execute supplier code. An external acquisition adapter declares streams, sends
			normalized timestamped samples, imports run packages, or registers timestamped media through
			the documented data routes.
		</p>
		<Callout type="info" title="Stream event feed">
			Telemetry samples and limit events come from <code>/api/projects/:id/streams/events</code>.
			Project structure reads and writes use the object routes directly.
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
