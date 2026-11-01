<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const createProject = `npm ci
npm run build --workspace mcs-platform
node mcs/bin/mcs.js create flight-demo --template flight-system --no-install
node mcs/bin/mcs.js open flight-demo --open`;
	const startDemo = `cd flight-demo
npm run demo:telemetry`;
</script>

<svelte:head><title>{docTitle('Flight system starter')}</title></svelte:head>

<PageHeader
	title="Flight system starter"
	description="Create an offline example project with a seeded flight overview and optional local telemetry."
/>

<article class="doc-page">
	<section>
		<h2>Create the project</h2>
		<p>Run this from the MCS repository root. The release packages are prepared but not published yet, so the commands use the local source tree.</p>
		<CodeBlock lang="bash" title="Create and run the starter" code={createProject} />
		<p>The <code>flight-system</code> template seeds a project tree, stream metadata, recent sample history, and a <code>flight-overview</code> display. The example data is synthetic and stays in the local project.</p>
	</section>

	<section>
		<h2>Start the simulator</h2>
		<p>To add new samples, open a second terminal in the generated project and run:</p>
		<CodeBlock lang="bash" title="Send local demo telemetry" code={startDemo} />
		<p>The script sends telemetry to the local versioned ingest route. It does not send commands to a vehicle or device.</p>
	</section>

	<section>
		<h2>Inspect the project</h2>
		<p>Open the flight overview to see the seeded streams and displays. The project uses the same object tree, ingest API, and replay tools as a project you create from scratch.</p>
		<Callout type="info" title="Offline by default">
			The starter does not need a remote service. Its simulator is opt-in and posts to the local MCS server.
		</Callout>
	</section>

	<section>
		<h2>Keep or remove the sample data</h2>
		<p>The template files live in the generated project. Edit the objects and stream definitions there, or create a blank project from the repository root with <code>node mcs/bin/mcs.js create flight-demo --no-install</code>.</p>
	</section>
</article>
