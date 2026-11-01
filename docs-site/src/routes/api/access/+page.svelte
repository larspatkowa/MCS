<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Health and access API')}</title></svelte:head>

<PageHeader
	title="Health and access API"
	description="Health routes report service status. Account, membership, and source-token routes are used when authentication is enabled."
/>

<article class="doc-page">
	<section>
		<h2>Health routes</h2>
		<table>
			<thead><tr><th>Route</th><th>Response</th></tr></thead>
			<tbody>
				<tr><td><code>GET /api/health</code></td><td>Liveness and uptime.</td></tr>
				<tr><td><code>GET /api/health/ready</code></td><td>Readiness for project databases, sources, and configured authentication.</td></tr>
			</tbody>
		</table>
		<p>The readiness route returns HTTP 503 when a configured project database is unavailable or required authentication has no administrator account.</p>
	</section>

	<section>
		<h2>Authentication routes</h2>
		<table>
			<thead><tr><th>Route</th><th>Use</th></tr></thead>
			<tbody>
				<tr><td><code>POST /api/auth/bootstrap</code></td><td>Create the first administrator with the bootstrap token.</td></tr>
				<tr><td><code>POST /api/auth/login</code></td><td>Start an authenticated session.</td></tr>
				<tr><td><code>POST /api/auth/logout</code></td><td>End the current session.</td></tr>
				<tr><td><code>GET /api/auth/session</code></td><td>Read the current session.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Users and project membership</h2>
		<table>
			<thead><tr><th>Route</th><th>Use</th></tr></thead>
			<tbody>
				<tr><td><code>GET /api/admin/users</code></td><td>List accounts.</td></tr>
				<tr><td><code>POST /api/admin/users</code></td><td>Create an account.</td></tr>
				<tr><td><code>GET /api/admin/projects/:id/members</code></td><td>List project members.</td></tr>
				<tr><td><code>PUT /api/admin/projects/:id/members</code></td><td>Add or update a member's role.</td></tr>
				<tr><td><code>DELETE /api/admin/projects/:id/members/:userId</code></td><td>Remove a project member.</td></tr>
				<tr><td><code>GET /api/admin/audit</code></td><td>Read administrative audit events.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Acquisition tokens</h2>
		<p>Project administrators can list, create, and revoke project-scoped tokens at <code>/api/projects/:id/tokens</code>. A token is shown once when it is created. Send it as a Bearer token when posting to <code>/api/ingest/v2</code>.</p>
		<p>Project roles are <code>viewer</code>, <code>editor</code>, and <code>admin</code>. Global administrators manage accounts and membership. See <a href="/guides/remote-access">remote access</a> for setup and deployment requirements.</p>
	</section>
</article>
