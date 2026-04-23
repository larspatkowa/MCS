<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const listFiles = `curl http://localhost:6000/api/plugins/files`;

	const createFile = `curl -X POST http://localhost:6000/api/plugins/files \\
  -H "Content-Type: application/json" \\
  -d '{ "ext": "mjs" }'`;

	const saveFile = `curl -X PUT http://localhost:6000/api/plugins/files/my-plugin.mjs \\
  -H "Content-Type: application/json" \\
  -d '{ "content": "// your script" }'`;
</script>

<svelte:head>
	<title>{docTitle('In-app plugin editor')}</title>
</svelte:head>

<PageHeader
	title="In-app plugin editor"
	badge="Tutorial"
	description="Create and edit external Node (.mjs) or Python (.py) connectors stored under data/user-plugins/, then start them against the open project."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			The plugin editor lives at <code>/plugin-editor</code> in the running MCS app. It uses the same start/stop
			API as Settings → Data sources. In-process TypeScript simulations cannot be edited here; they ship with MCS
			and require a developer build to change.
		</p>
	</section>

	<section>
		<h2>Workflow</h2>
		<ol>
			<li>Open a project so MCS knows which <code>projectId</code> to pass to spawned scripts.</li>
			<li>Go to <strong>Settings → Data sources</strong> and click <strong>Open plugin editor</strong>, or open <code>/plugin-editor</code> directly.</li>
			<li>Create a new <code>.mjs</code> or <code>.py</code> file, edit it, and <strong>Save</strong> (Ctrl/Cmd+S).</li>
			<li>Click <strong>Start</strong> or <strong>Restart</strong> so the process reloads your code.</li>
		</ol>
		<Callout type="warning" title="Restart after edits">
			External plugins are long-running processes. Saving to disk does not hot-reload; use <strong>Restart</strong> in the editor toolbar.
		</Callout>
	</section>

	<section>
		<h2>HTTP API (same as the UI)</h2>
		<p>Files are stored under <code>data/user-plugins/</code> relative to the MCS working directory.</p>
		<CodeBlock lang="bash" title="List scripts" code={listFiles} />
		<CodeBlock lang="bash" title="Create a starter script" code={createFile} />
		<CodeBlock lang="bash" title="Overwrite file contents" code={saveFile} />
		<p>
			Plugin ids match the filename without extension. After creating <code>my-plugin.mjs</code>, start it with
			<code>POST /api/plugins/start</code> and body <code>{`{ "id": "my-plugin", "projectId": "…" }`}</code>.
		</p>
	</section>

	<section>
		<h2>Environment variables</h2>
		<p>
			Spawned scripts receive <code>MCS_API_URL</code> (base URL including <code>/api</code>),
			<code>MCS_PROJECT_ID</code>, <code>MCS_PLUGIN_ID</code>, and <code>MCS_PLUGIN_RUNTIME</code> (<code>node</code> or
			<code>python</code>). POST telemetry to the <code>/ingest</code> path on that base URL, as in the generated templates.
		</p>
	</section>
</article>
