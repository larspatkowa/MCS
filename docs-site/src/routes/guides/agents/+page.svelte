<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const claudeCode = `claude mcp add --transport http mcs http://127.0.0.1:5173/api/mcp`;
	const stdioConfig = `{
  "mcpServers": {
    "mcs": {
      "command": "node",
      "args": ["/path/to/MCS/mcs/bin/mcs.js", "mcp", "--url", "http://127.0.0.1:5173"]
    }
  }
}`;
	const tokenConfig = `claude mcp add --transport http mcs https://gs.example.org/api/mcp \\
  --header "Authorization: Bearer $MCS_PROJECT_TOKEN"`;
	const raw = `curl -s http://127.0.0.1:5173/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"stream_stats","arguments":{
         "projectId":"<id>","streamId":"vehicle:state","field":"alt","from":"-15m"}}}'`;

	const tools = [
		['list_projects', 'Projects the caller can open.'],
		['describe_project', 'Streams with fields, units and newest sample time; sources; active run; limits.'],
		['get_latest', 'Newest sample of each stream with its age.'],
		['query_history', 'Samples in a range, reduced to per-bucket min and max when large.'],
		['stream_stats', 'Count, min, max (with time), mean, first and last of a field.'],
		['list_alarms / acknowledge_alarm', 'Limit violations and their acknowledgement.'],
		['set_limits', 'Warning and critical thresholds for a stream field.'],
		['list_runs / control_recording', 'Recorded runs, and start, pause, resume or stop.'],
		['add_note', 'Timestamped operator note in the project log.'],
		['ingest', 'Write samples, for example from a simulation.'],
		['list_objects / create_object / update_object', 'Read and build displays and layouts.']
	];
</script>

<svelte:head><title>{docTitle('AI agents (MCP)')}</title></svelte:head>

<PageHeader
	title="AI agents (MCP)"
	description="MCS includes a Model Context Protocol server, so an agent can read telemetry, answer questions about a flight, watch alarms and build displays."
/>

<article class="doc-page">
	<section>
		<h2>Connect an agent</h2>
		<p>
			The server listens at <code>/api/mcp</code> on the same port as the web UI, using MCP's
			Streamable HTTP transport. Clients that support HTTP connect to it directly:
		</p>
		<CodeBlock lang="bash" title="Claude Code" code={claudeCode} />
		<p>
			Clients that only launch local processes use the stdio bridge in the CLI. It forwards each
			message to the running server.
		</p>
		<CodeBlock lang="json" title="Desktop client config (stdio)" code={stdioConfig} />
	</section>

	<section>
		<h2>Access</h2>
		<p>
			The MCP server follows the same rules as the REST API. In the default loopback mode without
			accounts every local client has full access. With accounts enabled, send a project API token
			as a bearer token. The agent then reaches only that project. A signed-in viewer can call the
			read tools but not the ones that write.
		</p>
		<CodeBlock lang="bash" title="Remote server with a project token" code={tokenConfig} />
		<Callout type="warning" title="Agents can write">
			<code>ingest</code>, <code>control_recording</code>, <code>set_limits</code> and the object
			tools change project data. Give an agent a token for a scratch project if it should only
			experiment.
		</Callout>
	</section>

	<section>
		<h2>Tools</h2>
		<table>
			<thead><tr><th>Tool</th><th>What it does</th></tr></thead>
			<tbody>
				{#each tools as [name, purpose] (name)}
					<tr><td><code>{name}</code></td><td>{purpose}</td></tr>
				{/each}
			</tbody>
		</table>
		<p>
			Time arguments take Unix seconds, ISO 8601, or relative values such as <code>-15m</code>.
			Results use ISO 8601 UTC. A multi-field stream is plotted one field at a time as
			<code>stream#field</code>, for example <code>vehicle:state#alt</code>.
		</p>
	</section>

	<section>
		<h2>Example requests</h2>
		<ul>
			<li>"What was apogee on the last flight, and when?"</li>
			<li>"Are any alarms open? Acknowledge the chamber pressure warnings."</li>
			<li>"Build a tab view with altitude and velocity, a values table and the ground track."</li>
			<li>"Set a critical limit on battery voltage below 7.0 V."</li>
		</ul>
		<CodeBlock lang="bash" title="The same call without an agent" code={raw} />
	</section>
</article>
