<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const remoteStart = `npm run build --workspace mcs-platform
export MCS_AUTH_REQUIRED=1
export MCS_BOOTSTRAP_TOKEN="$(openssl rand -base64 32)"
node mcs/bin/mcs.js open ./project --host 0.0.0.0 --allow-remote`;
</script>

<svelte:head><title>{docTitle('Remote access')}</title></svelte:head>

<PageHeader
	title="Remote access"
	description="MCS binds to loopback by default. A remote bind requires authentication, a bootstrap secret, and an HTTPS front end."
/>

<article class="doc-page">
	<section>
		<h2>Enable accounts</h2>
		<p>From the MCS repository root, install dependencies with <code>npm ci</code> once. Then set <code>MCS_AUTH_REQUIRED=1</code>, create a one-time bootstrap token, and open the project with a non-loopback host and <code>--allow-remote</code>. The release packages are prepared but not published yet, so this command runs the local source tree.</p>
		<CodeBlock lang="bash" title="Start an authenticated instance" code={remoteStart} />
		<p>Put MCS behind a proxy that terminates HTTPS before making it available to other machines. Do not expose the app directly over plain HTTP.</p>
		<Callout type="warning" title="Keep the bootstrap token private">
			Use the token once to create the first administrator. Do not put it in a URL, source file, or shared project folder.
		</Callout>
	</section>

	<section>
		<h2>Create the first administrator</h2>
		<p>Open <code>/login</code> and use the bootstrap token to create the first account. After that, administrators add users and grant project membership. Passwords must be at least 12 characters.</p>
	</section>

	<section>
		<h2>Project roles</h2>
		<table>
			<thead><tr><th>Role</th><th>Access</th></tr></thead>
			<tbody>
				<tr><td>Viewer</td><td>Read project data.</td></tr>
				<tr><td>Editor</td><td>Read and change project data.</td></tr>
				<tr><td>Admin</td><td>Manage project access and acquisition tokens.</td></tr>
			</tbody>
		</table>
		<p>Global administrators manage accounts and project membership. Project acquisition tokens are scoped to one project and can be revoked.</p>
	</section>

	<section>
		<h2>Ingest from an acquisition bridge</h2>
		<p>When authentication is enabled, send the project token as a Bearer token to <code>/api/ingest/v2</code>. Use one token per source where practical, and revoke it when that source no longer needs access.</p>
		<p>See <a href="/api/access">health and access routes</a> for the account and token endpoints.</p>
	</section>

	<section>
		<h2>Browser protection</h2>
		<p>Every request passes the same checks before it reaches a route:</p>
		<ul>
			<li>A write whose <code>Origin</code> or <code>Sec-Fetch-Site</code> names another site is refused.</li>
			<li>A write body must be <code>application/json</code> or <code>multipart/form-data</code>. Other types are the ones a web page can send to another site without asking first.</li>
			<li>Without accounts, MCS answers only <code>localhost</code>, <code>*.localhost</code> and IP addresses in the <code>Host</code> header. This stops DNS rebinding, where a web page points its own domain at your machine. To reach a laptop by a name such as <code>groundstation.local</code>, list it: <code>MCS_ALLOWED_HOSTS=groundstation.local</code>.</li>
			<li>Pages send a Content-Security-Policy that allows only MCS's own scripts and forbids framing MCS in another site.</li>
		</ul>
	</section>
</article>
