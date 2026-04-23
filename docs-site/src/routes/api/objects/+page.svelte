<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import { docTitle } from '$lib/nav.js';

	const createObject = `curl -X POST http://localhost:6000/api/projects/YOUR_PROJECT_ID/objects \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "line-plot",
    "parentId": "ROOT_OR_FOLDER_ID",
    "name": "Altitude",
    "props": {
      "dataSources": ["rocket:altitude"],
      "seriesNames": ["Altitude"]
    }
  }'`;

	const patchObject = `curl -X PATCH http://localhost:6000/api/projects/YOUR_PROJECT_ID/objects/OBJECT_ID \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Altitude (km)",
    "expectedUpdatedAt": "2026-04-10T12:00:00.000Z",
    "props": {
      "yAxis": { "label": "km", "min": 0, "max": 400 }
    }
  }'`;
</script>

<svelte:head>
	<title>{docTitle('Objects API')}</title>
</svelte:head>

<PageHeader
	title="Objects API"
	description="Object routes expose the project tree, create child objects, update one object at a time, and support drag-and-drop reorder and reparent operations."
/>

<article class="doc-page">
	<section>
		<h2>Routes</h2>
		<table>
			<thead>
				<tr><th>Route</th><th>Use</th></tr>
			</thead>
			<tbody>
				<tr><td><code>GET /api/projects/:id/objects</code></td><td>Return the full object tree.</td></tr>
				<tr><td><code>POST /api/projects/:id/objects</code></td><td>Create a child object.</td></tr>
				<tr><td><code>GET /api/projects/:id/objects/:objectId</code></td><td>Return one object.</td></tr>
				<tr><td><code>PATCH /api/projects/:id/objects/:objectId</code></td><td>Update name, notes, or props.</td></tr>
				<tr><td><code>DELETE /api/projects/:id/objects/:objectId</code></td><td>Delete an object.</td></tr>
				<tr><td><code>POST /api/projects/:id/object-reorder</code></td><td>Rewrite a parent’s child order.</td></tr>
				<tr><td><code>POST /api/projects/:id/object-reparent</code></td><td>Move an object to a new parent.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Create</h2>
		<CodeBlock lang="bash" title="Create an object" code={createObject} />
		<p>
			The server allows children only under the project root, folders, and layout or container
			objects. New props are merged with the built-in defaults for the selected type.
		</p>
	</section>

	<section>
		<h2>Update</h2>
		<CodeBlock lang="bash" title="Update an object" code={patchObject} />
		<p>
			If you include <code>expectedUpdatedAt</code> and the object changed in the meantime, the
			server returns HTTP 409 with the current object payload.
		</p>
	</section>

	<section>
		<h2>Reorder and reparent</h2>
		<ul>
			<li><code>object-reorder</code> expects <code>{`{ parentId, childIds }`}</code>.</li>
			<li><code>object-reparent</code> expects <code>{`{ objectId, newParentId, insertBeforeId? }`}</code>.</li>
			<li>Both routes return <code>{`{ "ok": true }`}</code> on success.</li>
		</ul>
	</section>
</article>
