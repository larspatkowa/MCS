<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const definition = `{
  "version": 1,
  "operations": [
    { "op": "scale", "factor": 1.8 },
    { "op": "movingAverage", "window": 5 }
  ]
}`;
</script>

<svelte:head><title>{docTitle('Derived values')}</title></svelte:head>

<PageHeader
	title="Derived values"
	description="Transforms are serializable operations with bounded inputs. They do not execute JavaScript or replace raw samples."
/>

<article class="doc-page">
	<section>
		<h2>Define a transform</h2>
		<p>A transform applies operations to a copy of a numeric stream series. Each operation consumes the previous result, so order matters.</p>
		<CodeBlock lang="json" title="Transform definition" code={definition} />
		<p>Submit the definition to <code>POST /api/projects/:id/streams/:streamId/derived</code> with the source time range in the query string. The request can use a JSON <code>transform</code> object or a short pipe-delimited <code>text</code> definition.</p>
	</section>

	<section>
		<h2>Supported operations</h2>
		<table>
			<thead><tr><th>Operation</th><th>Input</th></tr></thead>
			<tbody>
				<tr><td><code>scale</code>, <code>offset</code></td><td>Multiply by a factor or add an amount.</td></tr>
				<tr><td><code>logarithm</code></td><td>Take a logarithm with a positive base other than 1.</td></tr>
				<tr><td><code>clamp</code></td><td>Keep values between a minimum and maximum.</td></tr>
				<tr><td><code>derivative</code>, <code>integral</code></td><td>Compute the rate of change or accumulated value over sample time.</td></tr>
				<tr><td><code>movingAverage</code>, <code>min</code>, <code>max</code></td><td>Apply a sample-count window.</td></tr>
				<tr><td><code>resample</code></td><td>Sample at a positive interval using linear interpolation or the previous value.</td></tr>
				<tr><td><code>align</code></td><td>Keep samples that fall within a positive time tolerance.</td></tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Output and limits</h2>
		<p>The response contains the derived samples, a skipped count, and any warnings. Invalid operations and non-finite values are rejected. The input range and output are bounded by the API query limits.</p>
		<Callout type="info" title="Raw data stays intact">
			MCS returns derived results separately. Keep the original stream as the source for later calculations and audit.
		</Callout>
	</section>
</article>
