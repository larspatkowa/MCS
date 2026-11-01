<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { docTitle } from '$lib/nav.js';

	const createProject = `curl -X POST http://127.0.0.1:8080/api/projects \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Telemetry Project",
    "path": "/absolute/path/to/project-folder",
    "notes": "Created from the API"
  }'`;

	const patchProject = `curl -X PATCH http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Updated name",
    "settings": {
      "dateTime": { "dateFormat": "iso", "timeFormat": "24h" }
    }
  }'`;

	const deleteProject = `curl -X DELETE http://127.0.0.1:8080/api/projects/YOUR_PROJECT_ID \\
  -H "Content-Type: application/json" \\
  -d '{ "deleteFolder": true }'`;

	const batchDelete = `curl -X POST http://127.0.0.1:8080/api/projects/batch-delete \\
  -H "Content-Type: application/json" \\
  -d '{
    "ids": ["PROJECT_ID_1", "PROJECT_ID_2"],
    "deleteFolder": false
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Projects API')}</title>
</svelte:head>

<PageHeader
	title="Projects API"
	description="Project routes list recent projects, create project folders, update settings, and control membership and deletion."
/>

<article class="doc-page">
	<section>
		<h2>Routes</h2>
		<table>
			<thead>
				<tr><th>Route</th><th>Use</th></tr>
			</thead>
			<tbody>
				<tr><td><code>GET /api/projects</code></td><td>List recent projects from <code>config.json</code>.</td></tr>
				<tr><td><code>POST /api/projects</code></td><td>Create a project manifest, database, and root object.</td></tr>
				<tr><td><code>GET /api/projects/:id</code></td><td>Return one manifest plus its resolved path.</td></tr>
				<tr><td><code>PATCH /api/projects/:id</code></td><td>Update <code>name</code>, <code>notes</code>, or <code>settings</code>.</td></tr>
				<tr><td><code>DELETE /api/projects/:id</code></td><td>Remove from recents, optionally delete the project folder.</td></tr>
				<tr><td><code>POST /api/projects/batch-delete</code></td><td>Remove or delete many projects by id. Returns per-id results; status <code>207</code> if any entry failed.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Create</h2>
		<CodeBlock lang="bash" title="Create a project" code={createProject} />
		<p>
			If <code>path</code> is omitted, the server creates a folder under <code>./data/projects</code>
			based on the project name.
		</p>
	</section>

	<section>
		<h2>Update settings</h2>
		<CodeBlock lang="bash" title="Update a project" code={patchProject} />
		<p>
			Date/time settings are merged into the existing project settings.
		</p>
	</section>

	<section>
		<h2>Delete</h2>
		<CodeBlock lang="bash" title="Delete a project" code={deleteProject} />
		<p>
			Without a JSON body, deletion only removes the project from the recent-project list. Folder
			deletion is guarded, so the target must live under <code>mcs/data/projects</code>.
		</p>
	</section>

	<section>
		<h2>Batch delete</h2>
		<CodeBlock lang="bash" title="Batch remove or delete" code={batchDelete} />
		<p>
			Body: <code>ids</code> (string array of project UUIDs) and optional <code>deleteFolder</code>
			(boolean, default <code>false</code>). Same folder guard as single delete. Response is
			<code>&#123; results: &#123; id, ok, error? &#125;[] &#125;</code>. HTTP <code>200</code> when
			every entry succeeded, <code>207</code> when at least one failed. Unknown ids are treated as
			success (no-op).
		</p>
	</section>
</article>
