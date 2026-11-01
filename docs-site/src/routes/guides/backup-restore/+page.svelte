<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const backup = `node mcs/bin/mcs.js backup ./flight-project ./backups/flight-project-copy`;
	const restore = `node mcs/bin/mcs.js restore ./backups/flight-project-copy ./flight-project-restored`;
</script>

<svelte:head><title>{docTitle('Backup and restore')}</title></svelte:head>

<PageHeader
	title="Backup and restore"
	description="The project backup commands copy project data, verify hashes, and restore into a new or empty directory."
/>

<article class="doc-page">
	<section>
		<h2>Create a backup</h2>
		<p>From the MCS repository root, install dependencies with <code>npm ci</code> once. The release packages are prepared but not published yet, so these examples use the local CLI.</p>
		<CodeBlock lang="bash" title="Back up a project" code={backup} />
		<p>A backup contains the project manifest, SQLite database, media, and project metadata. MCS writes a hash manifest and excludes local runtime credentials.</p>
	</section>

	<section>
		<h2>Restore to a new directory</h2>
		<CodeBlock lang="bash" title="Restore a project" code={restore} />
		<p>Restore verifies the backup hashes and database integrity before writing the destination. The destination must be new or empty, which leaves the original project in place.</p>
		<Callout type="info" title="Keep runtime config separate">
			Project backups do not include local authentication or runtime config. Recreate those settings for the restored project as needed.
		</Callout>
	</section>

	<section>
		<h2>Check the restored project</h2>
		<p>Build the server with <code>npm run build --workspace mcs-platform</code>, then open the restored directory with <code>node mcs/bin/mcs.js open ./flight-project-restored</code>. Confirm that its objects, telemetry, media, and runs are present. If the project format needs a migration, run <code>node mcs/bin/mcs.js upgrade ./flight-project-restored</code>.</p>
	</section>
</article>
