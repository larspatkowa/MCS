<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const exampleDial = `{
  "type": "gauge",
  "name": "Tank pressure",
  "props": {
    "dataSource": "sample:pressure",
    "displayType": "dial",
    "min": 0,
    "max": 3000,
    "unit": "psi",
    "label": "Tank",
    "showLabel": true,
    "thresholdMax": 2800,
    "warningMax": 2500
  }
}`;

	const exampleLinear = `{
  "type": "gauge",
  "name": "CPU usage",
  "props": {
    "dataSource": "sys:cpu_usage",
    "displayType": "linear",
    "min": 0,
    "max": 100,
    "unit": "%",
    "label": "CPU",
    "showLabel": true,
    "warningMax": 80,
    "thresholdMax": 92
  }
}`;
</script>

<svelte:head>
	<title>{docTitle('Gauge')}</title>
</svelte:head>

<PageHeader
	title="Gauge"
	badge="Component"
	description="Single-stream readout as either a linear bar or a dial gauge."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			Gauges visualize one scalar stream. They can poll sample streams (the <code>sample:*</code> ids)
			or subscribe to live SSE streams from plugins/connectors.
		</p>
		<Callout type="tip" title="Quick preview">
			Use <code>/gallery</code> to preview gauges with built-in sample data.
		</Callout>
	</section>

	<section>
		<h2>Display types</h2>
		<ul>
			<li><strong>linear</strong>: fills the available width and shows the value above the track.</li>
			<li><strong>dial</strong>: circular arc + needle. The readout is normally stacked under the dial.</li>
		</ul>
		<Callout type="info" title="Dial readout layout">
			In wide layouts the dial keeps the value/label <strong>below</strong> the dial when there’s enough
			height. It only switches to a split layout (dial left, readout right) in very wide, short panels.
		</Callout>
	</section>

	<section>
		<h2>Example: dial gauge</h2>
		<CodeBlock lang="json" title="Object JSON (dial)" code={exampleDial} />
	</section>

	<section>
		<h2>Example: linear gauge</h2>
		<CodeBlock lang="json" title="Object JSON (linear)" code={exampleLinear} />
	</section>
</article>

