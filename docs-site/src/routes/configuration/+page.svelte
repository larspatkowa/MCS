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
  "name": "Multi-Stage Rocket Demo",
  "createdAt": "2026-02-26T04:16:02.923Z",
  "notes": "Getting-started example. Start the Rocket Mission plugin to see live data.",
  "settings": {
    "autoStartPlugins": ["rocket-mission"],
    "tutorialExampleKind": "rocket",
    "dateTime": {
      "dateFormat": "iso",
      "timeFormat": "24h"
    }
  }
}`;

	const folderStructure = `my-project/
├── project.json
└── mcs.db`;
</script>

<svelte:head>
	<title>{docTitle('Configuration')}</title>
</svelte:head>

<PageHeader
	title="Configuration"
	description="How MCS stores recent projects, project folders, and project-level settings."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			MCS keeps one global config file and one folder per project. By default the config lives at
			<code>{`<cwd>/data/config.json`}</code>. Set <code>MCS_CONFIG_DIR</code> if you want it
			somewhere else.
		</p>
	</section>

	<section>
		<h2>Global config</h2>
		<CodeBlock lang="json" title="data/config.json" code={configExample} />
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
			The manifest is plain JSON. MCS creates and manages the SQLite database. If you remove
			<code>mcs.db</code>, MCS recreates it the next time that project opens.
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
				<tr><td>settings.autoStartPlugins</td><td>string[]</td><td>Simulation or connector ids (same as <code>/api/plugins/start</code>) to run when the project opens.</td></tr>
				<tr><td>settings.tutorialExampleKind</td><td><code>rocket</code> | <code>ndvi</code> | <code>system</code></td><td>Optional. When set, the in-app tour uses copy matched to that example. PATCH with <code>null</code> to remove.</td></tr>
				<tr><td>settings.dateTime.dateFormat</td><td><code>yyyy/m/d</code> | <code>short</code> | <code>iso</code></td><td>Date format override.</td></tr>
				<tr><td>settings.dateTime.timeFormat</td><td><code>24h</code> | <code>12h</code></td><td>Time format override. Default is <code>24h</code>.</td></tr>
			</tbody>
		</table>
		<Callout type="info" title="Timestamp display">
			When <code>timeFormat</code> is <code>24h</code>, “today” timestamps in compact grids are shown as <code>HHmm</code>
			(for example <code>1539</code>), while older items fall back to a short locale date.
		</Callout>
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
