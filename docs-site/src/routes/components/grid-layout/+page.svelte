<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const example = `{
  "type": "grid-layout",
  "name": "Mission layout",
  "props": {
    "gridSize": [16, 16],
    "dimensions": [960, 540],
    "scaleToFit": true,
    "items": [
      {
        "id": "cell-1",
        "objectId": "object:altitude-plot",
        "x": 0,
        "y": 0,
        "width": 30,
        "height": 18
      },
      {
        "id": "cell-2",
        "objectId": "object:gps-map",
        "x": 30,
        "y": 0,
        "width": 30,
        "height": 18
      }
    ]
  }
}`;
</script>

<svelte:head>
	<title>{docTitle('Grid Layout')}</title>
</svelte:head>

<PageHeader
	title="Grid Layout"
	badge="Component"
	description="Fixed-position dashboard canvas with draggable/resizable cells in edit mode."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			Grid Layout is the fixed canvas container. Each item places an <code>objectId</code> at a grid
			position (<code>x</code>, <code>y</code>) with a grid-sized width/height.
		</p>
	</section>

	<section>
		<h2>Editing the layout</h2>
		<ul>
			<li><strong>Add</strong>: drag any object from the Explorer onto the canvas.</li>
			<li><strong>Move / resize</strong>: enable edit mode, then drag the cell or its handles.</li>
			<li>
				<strong>Inspect a cell’s object</strong>: click the cell title to show that object in the Properties
				panel without leaving the layout.
			</li>
		</ul>
		<Callout type="info" title="Placement vs. object properties">
			“Edit placement” changes the grid cell (x/y/width/height) on the parent layout, while “Inspect” shows
			the nested object’s own props (like stream IDs, colors, etc.).
		</Callout>
		<Callout type="info" title="Fullscreen">
			The center header “Fullscreen” button uses the browser’s real fullscreen mode. If you just want more
			room inside the normal viewport, collapse the sidebars instead.
		</Callout>
	</section>

	<section>
		<h2>Example: two-panel grid</h2>
		<CodeBlock lang="json" title="Object JSON (grid layout)" code={example} />
	</section>
</article>

