<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';

	const example = `{
  "type": "flex-layout",
  "name": "Field layout",
  "props": {
    "root": {
      "id": "root",
      "type": "split",
      "direction": "horizontal",
      "ratio": 0.6,
      "children": [
        { "id": "left", "type": "leaf", "objectId": "object:vegetation" },
        { "id": "right", "type": "leaf", "objectId": "object:thermal-stress" }
      ]
    }
  }
}`;
</script>

<svelte:head>
	<title>{docTitle('Flex Layout')}</title>
</svelte:head>

<PageHeader
	title="Flex Layout"
	badge="Component"
	description="Resizable split panes for dashboards where panels can be swapped or split by drag-and-drop."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			Flex Layout is the “split pane” container. It stores a small binary tree of panes where each node is
			either a <strong>leaf</strong> (shows one object) or a <strong>split</strong> (two children with a
			divider).
		</p>
	</section>

	<section>
		<h2>Editing the layout</h2>
		<ul>
			<li><strong>Resize</strong>: drag the divider between two panes.</li>
			<li>
				<strong>Split with a new object</strong>: drag an object from the sidebar tree onto a pane edge
				(left/right/top/bottom).
			</li>
			<li>
				<strong>Replace</strong>: drag an object from the sidebar tree onto the center of a pane.
			</li>
			<li>
				<strong>Rearrange existing panes</strong>: drag a pane title onto another pane.
				<ul>
					<li><strong>Drop center</strong>: swaps the two panes.</li>
					<li><strong>Drop edge</strong>: moves the dragged pane into a new split on that side.</li>
				</ul>
			</li>
			<li>
				<strong>Inspect a pane’s object</strong>: click the pane title to show that object in the Properties
				panel without leaving the layout.
			</li>
		</ul>
		<Callout type="info" title="Drop targets">
			Flex Layout uses a center target (a small rectangle) plus four edge targets (trapezoids to the left,
			right, top, and bottom edges). Center means “swap/replace”; edges mean “split”.
		</Callout>
		<Callout type="info" title="No empty gap after moving a pane">
			When you move an existing pane into a split, the source location collapses away. You should not end
			up with an empty “Drop an object here” pane unless you explicitly split into a blank slot.
		</Callout>
		<Callout type="info" title="Fullscreen">
			The center header “Fullscreen” button uses the browser’s real fullscreen mode. If you just want more
			room inside the normal viewport, collapse the sidebars instead.
		</Callout>
	</section>

	<section>
		<h2>Example: split a field layout</h2>
		<CodeBlock lang="json" title="Object JSON (flex layout)" code={example} />
	</section>
</article>

