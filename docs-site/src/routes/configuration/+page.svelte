<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const configExample = `{
  "recentProjectPaths": [
    "/home/team/mcs-data/projects/launch-alpha",
    "/home/team/mcs-data/projects/test-stand"
  ],
  "defaultProjectPath": "/home/team/mcs-data/projects"
}`;

	const projectJsonExample = `{
  "id": "1ff30495-1b2c-4641-9aff-e3495d72efc8",
  "name": "My Project",
  "createdAt": "2026-02-26T04:16:02.923Z",
  "settings": {
    "dateTime": {
      "dateFormat": "iso",
      "timeFormat": "24h"
    }
  }
}`;

	const folderStructure = `my-project/
├── project.json
├── mcs.db
└── .mcs/
    ├── meta.json
    ├── media/      # imported assets, when present
    └── renders/    # render jobs, when present`;
</script>

<svelte:head>
	<title>{docTitle('Configuration')}</title>
</svelte:head>

<PageHeader
	title="Configuration"
	description="Where MCS keeps runtime configuration and project data, and which settings belong in a project manifest."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			MCS keeps a runtime config file and a folder for each project. The config directory defaults to
			<code>{`<cwd>/data/`}</code> and can be changed with <code>MCS_CONFIG_DIR</code>. When you open a
			project with the MCS CLI, its config defaults to
			<code>{`<project>/.mcs/runtime/`}</code>.
		</p>
	</section>

	<section>
		<h2>Share runtime settings</h2>
		<p>Set <code>MCS_CONFIG_DIR</code> to the same absolute directory before opening several projects to share recent-project settings. Runtime config is separate from the project manifest and database.</p>
	</section>

	<section>
		<h2>Recent projects config</h2>
		<CodeBlock lang="json" title="config.json" code={configExample} />
		<table>
			<thead>
				<tr><th>Field</th><th>Type</th><th>Meaning</th></tr>
			</thead>
			<tbody>
				<tr>
					<td>recentProjectPaths</td>
					<td>string[]</td>
					<td>Absolute paths shown in the project picker. MCS normalizes them on load.</td>
				</tr>
				<tr>
					<td>defaultProjectPath</td>
					<td>string</td>
					<td>Optional default base path for new projects.</td>
				</tr>
			</tbody>
		</table>
		<Callout type="tip" title="Resetting the picker">
			On the home screen, tap <strong>Select</strong>, then use <strong>Select all</strong>, <strong>Delete</strong>
			(confirm to delete selected project folders from disk), and <strong>Done</strong>. To remove entries from the
			recent list without deleting folders, use each project’s menu (<strong>Remove from list</strong>). You can also
			call <code>POST /api/projects/batch-delete</code>. To clear everything by hand, set
			<code>recentProjectPaths</code> to <code>[]</code>.
		</Callout>
	</section>

	<section>
		<h2>Project folders</h2>
		<CodeBlock lang="text" title="Project folder layout" code={folderStructure} />
		<p>
			The manifest is plain JSON. MCS creates and manages the SQLite database. Keep the manifest,
			database, and format metadata together. Removing <code>mcs.db</code> removes the project's objects and
			telemetry; MCS cannot reconstruct those records from the manifest.
		</p>
	</section>

	<section>
		<h2>project.json</h2>
		<CodeBlock lang="json" title="Project manifest" code={projectJsonExample} />
		<table>
			<thead>
				<tr><th>Field</th><th>Type</th><th>Meaning</th></tr>
			</thead>
			<tbody>
				<tr><td>id</td><td>string</td><td>Project identifier. Also reused as the root object id.</td></tr>
				<tr><td>name</td><td>string</td><td>Display name in the picker, header, and root object.</td></tr>
				<tr><td>createdAt</td><td>ISO timestamp</td><td>Creation time.</td></tr>
				<tr><td>notes</td><td>string</td><td>Optional description shown in the UI.</td></tr>
				<tr><td>settings.dateTime.dateFormat</td><td><code>yyyy/m/d</code> | <code>short</code> | <code>iso</code></td><td>Date format override.</td></tr>
				<tr><td>settings.dateTime.timeFormat</td><td><code>24h</code> | <code>12h</code></td><td>Time format override. Default is <code>24h</code>.</td></tr>
				<tr><td>settings.telemetryRetentionDays</td><td>integer</td><td>Continuous telemetry history retention, from 1 to 3,650 days. The default is 30 days. Saved runs are kept separately.</td></tr>
			</tbody>
		</table>
		<Callout type="info" title="Timestamp display">
			When <code>timeFormat</code> is <code>24h</code>, "today" timestamps in compact grids are shown as <code>HHmm</code>
			(for example <code>1539</code>), while older items fall back to a short locale date.
		</Callout>
	</section>

	<section>
		<h2>Project data</h2>
		<p>The project directory keeps its SQLite database, schema metadata, imported media, and render output together. A project backup includes the database and media, but leaves local runtime credentials out.</p>
		<p>See <a href="/guides/backup-restore">backup and restore</a> before moving a project to another machine.</p>
	</section>

	<section>
		<h2>Storage behavior</h2>
		<ul>
			<li>The config loader normalizes stored paths with <code>path.resolve()</code>.</li>
			<li>Recent-project entries are capped at 20 items.</li>
			<li>
				Deleting a project through the API removes the folder only when
				<code>{`{ "deleteFolder": true }`}</code> is provided and the target lives under
				<code>mcs/data/projects</code>.
			</li>
		</ul>
	</section>
</article>
