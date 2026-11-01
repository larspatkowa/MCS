<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const fontExample = `@font-face {
  font-family: "Field Sans";
  src: url("./fonts/FieldSans.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}

:root {
  --mcs-font-sans: "Field Sans", sans-serif;
  --mcs-accent: #17665e;
}`;
</script>

<svelte:head><title>{docTitle('Branding')}</title></svelte:head>

<PageHeader
	title="Branding"
	description="An operator can change the MCS theme with one runtime CSS file and optional local font files."
/>

<article class="doc-page">
	<section>
		<h2>Choose the config directory</h2>
		<p>When the MCS CLI opens a project, its default config lives in <code>&lt;project&gt;/.mcs/runtime/</code>. Set <code>MCS_CONFIG_DIR</code> to an absolute path when you want one config and brand shared across projects.</p>
		<p>For a development server started from the MCS source directory, an unset <code>MCS_CONFIG_DIR</code> defaults to <code>data/</code> in that working directory.</p>
	</section>

	<section>
		<h2>Add the stylesheet</h2>
		<p>Create <code>branding/branding.css</code> inside the config directory. MCS serves it at <code>/branding/branding.css</code> after the built-in styles. Save the file, then refresh the page. You do not need to rebuild the app.</p>
		<p>Font files go in <code>branding/fonts/</code>. Reference them with a path relative to the stylesheet:</p>
		<CodeBlock lang="css" title="branding/branding.css" code={fontExample} />
	</section>

	<section>
		<h2>Theme variables</h2>
		<p>The built-in theme uses CSS variables for background, surfaces, text, borders, accents, resizers, radius, and font stacks. Override the variables in <code>:root</code> or in the theme class used by the app.</p>
		<p>Use <code>--mcs-font-sans</code> and <code>--mcs-font-mono</code> for typography. Keep the provided light and dark theme classes; they define the app's base appearance.</p>
	</section>

	<section>
		<h2>File limits</h2>
		<p>The stylesheet is limited to 512 KiB. Each font file is limited to 20 MiB. MCS serves supported font files from the branding directory and does not serve nested font paths.</p>
		<Callout type="warning" title="Treat CSS as trusted code">
			A stylesheet can load remote resources and change the interface. Only trusted operators should be able to edit it.
		</Callout>
	</section>
</article>
