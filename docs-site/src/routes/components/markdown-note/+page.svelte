<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head><title>{docTitle('Markdown note')}</title></svelte:head>

<PageHeader
	title="Markdown note"
	badge="Component"
	description="Keep text and Markdown instructions beside a project's displays."
/>

<article class="doc-page">
	<section>
		<h2>Use a note</h2>
		<p>Add a Markdown note from the object picker. Edit its contents in the properties panel. The note stays in the project object tree, so it can sit next to the layout or data view it describes.</p>
	</section>

	<section>
		<h2>Good uses</h2>
		<ul>
			<li>Record the meaning of a stream or field.</li>
			<li>Write a short procedure for a test session.</li>
			<li>Keep interpretation notes near a chart or table.</li>
		</ul>
		<p>A note is project content. It does not change sample values or configure an acquisition source.</p>
	</section>
</article>
