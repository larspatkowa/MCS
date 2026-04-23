<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const minimalPlugin = [
		"// mcs/src/lib/server/plugins/altitude-sim-plugin.ts",
		"import { registerInProcess } from '$lib/server/plugin-registry.js';",
		"import * as streamsDb from '$lib/server/streams-db.js';",
		"import { getProjectPathById } from '$lib/server/project.js';",
		'',
		'export function registerAltitudeSimPlugin(): void {',
		'  registerInProcess({',
		"    id: 'altitude-sim',",
		"    name: 'Altitude Simulator',",
		"    type: 'in-process',",
		"    version: '1.0.0',",
		"    description: 'Synthetic altitude stream for demo projects.',",
		'    streams: [',
		"      { id: 'sim:altitude', name: 'Altitude', metadata: { unit: 'km', min: 0, max: 500 } }",
		'    ],',
		'    run(ctx) {',
		'      const projectPath = getProjectPathById(ctx.projectId);',
		'      if (!projectPath) return;',
		'',
		"      streamsDb.updateStreamMetadata(projectPath, 'sim:altitude', {",
		"        unit: 'km',",
		'        min: 0,',
		'        max: 500',
		"      }, 'Altitude');",
		'',
		'      let t = 0;',
		'      const timer = setInterval(() => {',
		"        ctx.ingest('sim:altitude', { value: 200 + 200 * Math.sin(t / 60) });",
		'        t++;',
		'      }, 1000);',
		'',
		'      ctx.onStop = () => clearInterval(timer);',
		'    }',
		'  });',
		'}'
	].join('\n');

	const bootstrapStep = [
		"// mcs/src/lib/server/plugins/bootstrap.ts",
		"import { registerSampleTelemetryPlugin } from './sample-telemetry-plugin.js';",
		"import { registerRocketMissionPlugin }   from './rocket-mission-plugin.js';",
		"import { registerSystemSensorPlugin }    from './system-sensor-plugin.js';",
		"import { registerAgriNdviMissionPlugin } from './agri-ndvi-mission-plugin.js';",
		"import { registerAltitudeSimPlugin }     from './altitude-sim-plugin.js';",
		'',
		'export function bootstrapBuiltInPlugins(): void {',
		'  registerSampleTelemetryPlugin();',
		'  registerRocketMissionPlugin();',
		'  registerSystemSensorPlugin();',
		'  registerAgriNdviMissionPlugin();',
		'  registerAltitudeSimPlugin();',
		'}'
	].join('\n');

	const startPlugin = `curl -X POST http://localhost:6000/api/plugins/start \\
  -H 'Content-Type: application/json' \\
  -d '{"id": "altitude-sim", "projectId": "YOUR_PROJECT_ID"}'

curl http://localhost:6000/api/plugins`;

	const externalExample = [
		'// weather-reader.mjs',
		'const apiUrl = process.env.MCS_API_URL;',
		'const projectId = process.env.MCS_PROJECT_ID;',
		'',
		'setInterval(async () => {',
		'  await fetch(`${apiUrl}/ingest`, {',
		"    method: 'POST',",
		"    headers: { 'Content-Type': 'application/json' },",
		'    body: JSON.stringify({',
		'      projectId,',
		"      streamId: 'weather:temperature',",
		'      values: { value: 22 + Math.random() * 4 }',
		'    })',
		'  });',
		'}, 1000);'
	].join('\n');
</script>

<svelte:head>
	<title>{docTitle('Write your first plugin')}</title>
</svelte:head>

<PageHeader
	title="Write your first plugin"
	badge="Tutorial"
	description="Build a small in-process plugin, register it with the built-in bootstrap, and start it for a project."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			This walkthrough uses an in-process plugin because it matches the built-in plugin model
			already used by <code>sample-telemetry</code>, <code>rocket-mission</code>,
			<code>system-sensor</code>, and <code>agri-ndvi-mission</code>.
		</p>
		<Callout type="info" title="What the descriptor does">
			The <code>streams</code> field on the descriptor makes the plugin discoverable through the
			plugin catalog. Stream rows and metadata for a project are still created by
			<code>streamsDb.updateStreamMetadata()</code> or by the stream declaration API.
		</Callout>
	</section>

	<section>
		<h2>1. Create the plugin file</h2>
		<CodeBlock lang="typescript" title="altitude-sim-plugin.ts" code={minimalPlugin} />
		<p>
			The important pieces are <code>registerInProcess()</code>, a stable <code>id</code>, and a
			<code>run(ctx)</code> function that assigns <code>ctx.onStop</code> before it returns.
		</p>
	</section>

	<section>
		<h2>2. Register it in the built-in bootstrap</h2>
		<CodeBlock lang="typescript" title="bootstrap.ts" code={bootstrapStep} />
		<p>
			<code>getAvailablePlugins()</code> calls the bootstrap at module load, so the new descriptor
			shows up in the UI and plugin APIs as soon as the server reloads.
		</p>
	</section>

	<section>
		<h2>3. Start it for a project</h2>
		<CodeBlock lang="bash" title="Start request" code={startPlugin} />
			<p>You can do the same thing from <strong>Settings → Data sources</strong> in the UI.</p>
	</section>

	<section>
		<h2>4. Optional: make an external plugin instead</h2>
		<p>
			If you need the data source in a separate process, call the REST API directly from Node,
			Python, or another runtime.
		</p>
		<CodeBlock lang="javascript" title="weather-reader.mjs" code={externalExample} />
	</section>

	<section>
		<h2>Where to go next</h2>
		<ul>
			<li>Add object scaffolding with <code>objectsDb.createObject()</code> if the plugin should build a starter dashboard.</li>
			<li>Use <a href="/api/streams">stream declaration and limits</a> if you need richer metadata or alarm thresholds.</li>
			<li>Use <a href="/api/plugins">the plugin endpoints</a> to inspect catalog, availability, and running state.</li>
		</ul>
	</section>
</article>
