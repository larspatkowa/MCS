<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const pluginConfig = `{
  "plugins": [
    {
      "id": "weather-reader",
      "name": "Weather Reader",
      "path": "/absolute/path/to/weather-reader.mjs",
      "type": "out-of-process",
      "version": "1.0.0",
      "description": "Fetches and ingests local weather data."
    }
  ]
}`;

	const externalEnv = `MCS_API_URL=http://localhost:6000/api
MCS_PROJECT_ID=YOUR_PROJECT_ID
MCS_PLUGIN_ID=weather-reader
MCS_PLUGIN_RUNTIME=node`;

	const startExample = `curl -X POST http://localhost:6000/api/plugins/start \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "system-sensor",
    "projectId": "YOUR_PROJECT_ID"
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Data sources')}</title>
</svelte:head>

<PageHeader
	title="Data sources"
	badge="Plugins"
	description="In the app this is labeled Data sources. Under the hood, MCS still uses an in-process registry and /api/plugins routes for built-in simulations and spawned connectors. Everything feeds the same ingest pipeline."
/>

<article class="doc-page">
	<section>
		<h2>Kinds</h2>
		<table>
			<thead>
				<tr><th>Kind</th><th>How it runs</th><th>Where it writes</th></tr>
			</thead>
			<tbody>
				<tr>
					<td>In-process (simulation)</td>
					<td>Loaded into the SvelteKit server through <code>registerInProcess()</code>.</td>
					<td><code>ctx.ingest()</code> calls <code>performIngest()</code> directly.</td>
				</tr>
				<tr>
					<td>External process (connector)</td>
					<td>Spawned as Node or Python by the plugin runner.</td>
					<td>HTTP requests to <code>/api/ingest</code> and related routes.</td>
				</tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Built-in simulations</h2>
		<p>These ids match the UI and <code>settings.autoStartPlugins</code>:</p>
		<table>
			<thead>
				<tr><th>Id</th><th>Runtime</th><th>What it does</th></tr>
			</thead>
			<tbody>
				<tr><td><code>sample-telemetry</code></td><td>in-process</td><td>Generates sample telemetry and scaffolds demo objects.</td></tr>
				<tr><td><code>rocket-mission</code></td><td>in-process</td><td>Runs a repeating multi-stage rocket mission simulation.</td></tr>
				<tr><td><code>system-sensor</code></td><td>in-process</td><td>Streams CPU, memory, disk, uptime, and public-IP geolocation.</td></tr>
				<tr><td><code>agri-ndvi-mission</code></td><td>in-process</td><td>Scaffolds the Agriculture demo (Sentinel-2 NDVI raster overlay + clustered green-enough coverage path) and emits agri:* streams.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Discovery for external connectors</h2>
		<p>MCS looks for external plugin descriptors in this order:</p>
		<ol>
			<li><code>plugins-config.json</code> in the app working directory.</li>
			<li><code>data/plugins-config.json</code>.</li>
			<li>A sibling <code>../plugins</code> directory containing <code>.mjs</code> or <code>.py</code> files.</li>
			<li>
				<code>data/user-plugins/</code> (scripts created or edited from the in-app plugin editor at
				<code>/plugin-editor</code>; same id rules as other external scripts).
			</li>
		</ol>
		<CodeBlock lang="json" title="plugins-config.json" code={pluginConfig} />
	</section>

	<section>
		<h2>Environment for spawned connectors</h2>
		<p>
			When MCS starts an external process, it injects connection details into the child process
			environment.
		</p>
		<CodeBlock lang="text" title="Environment variables" code={externalEnv} />
		<Callout type="tip" title="External scripts">
			Use the in-app plugin editor (<code>/plugin-editor</code>), <code>data/user-plugins/</code>, the sibling
			<code>../plugins</code> directory, or list paths in <code>plugins-config.json</code>.
		</Callout>
	</section>

	<section>
		<h2>Starting and stopping</h2>
		<p>
			Use <strong>Settings → Data sources</strong> in the app or call the plugin HTTP API directly.
			In-process simulations need a project id because each run targets one project database.
		</p>
		<CodeBlock lang="bash" title="Start a built-in simulation (same endpoint as before)" code={startExample} />
	</section>
</article>
