<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { docTitle } from '$lib/nav.js';

	const startPlugin = `curl -X POST http://localhost:6000/api/plugins/start \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "system-sensor",
    "projectId": "YOUR_PROJECT_ID"
  }'`;

	const stopPlugin = `curl -X POST http://localhost:6000/api/plugins/stop \\
  -H "Content-Type: application/json" \\
  -d '{ "id": "system-sensor" }'`;
</script>

<svelte:head>
	<title>{docTitle('Plugins API')}</title>
</svelte:head>

<PageHeader
	title="Plugins API"
	description="Plugin routes expose availability, merged catalog status, running processes, and start and stop control."
/>

<article class="doc-page">
	<section>
		<h2>Routes</h2>
		<table>
			<thead>
				<tr><th>Route</th><th>Use</th></tr>
			</thead>
			<tbody>
				<tr><td><code>GET /api/plugins</code></td><td>List currently running plugins only.</td></tr>
				<tr><td><code>GET /api/plugins/available</code></td><td>List available plugin descriptors.</td></tr>
				<tr><td><code>GET /api/plugins/catalog</code></td><td>List available plugins with merged runtime status.</td></tr>
				<tr><td><code>POST /api/plugins/start</code></td><td>Start an in-process or external plugin.</td></tr>
				<tr><td><code>POST /api/plugins/stop</code></td><td>Stop a running plugin by id.</td></tr>
				<tr><td><code>GET /api/plugins/files</code></td><td>List user plugin scripts in <code>data/user-plugins/</code>.</td></tr>
				<tr><td><code>POST /api/plugins/files</code></td><td>Create a new <code>.mjs</code> or <code>.py</code> starter file.</td></tr>
				<tr><td><code>GET /api/plugins/files/&lbrace;filename&rbrace;</code></td><td>Read one script file (basename only).</td></tr>
				<tr><td><code>PUT /api/plugins/files/&lbrace;filename&rbrace;</code></td><td>Write script contents (JSON body <code>content</code>).</td></tr>
				<tr><td><code>DELETE /api/plugins/files/&lbrace;filename&rbrace;</code></td><td>Delete a user script file.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Start</h2>
		<CodeBlock lang="bash" title="Start request" code={startPlugin} />
		<p>
			In-process plugins return <code>pid: 0</code>. External plugins spawn a child process and
			return the operating-system process id when available.
		</p>
	</section>

	<section>
		<h2>Stop</h2>
		<CodeBlock lang="bash" title="Stop request" code={stopPlugin} />
		<p>
			The stop route checks both the in-process registry and the external plugin runner. Successful
			stops return <code>{`{ "ok": true }`}</code>.
		</p>
	</section>
</article>
