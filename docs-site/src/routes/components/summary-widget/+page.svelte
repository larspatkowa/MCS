<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import { docTitle } from '$lib/nav.js';
</script>

<svelte:head>
	<title>{docTitle('Summary Widget')}</title>
</svelte:head>

<PageHeader
	title="Summary widget"
	badge="summary-widget"
	description="A compact status banner that evaluates rules against live stream values and shows a concise rule table."
/>

<article class="doc-page">
	<section>
		<p class="doc-lead">
			Use <code>summary-widget</code> when you want a small “health” indicator for a dashboard (for
			example: battery reserve, wind envelope, crop stress) with a banner at the top and a readable
			list of rules below.
		</p>
		<Callout type="tip" title="Good defaults">
			Set an <code>okLabel</code> like “Nominal” (or your domain language), then add rules ordered by
			severity so the banner always reflects the most important active condition.
		</Callout>
	</section>

	<section>
		<h2>Behavior</h2>
		<ul>
			<li>Subscribes to each rule’s <code>streamId</code> and evaluates the condition continuously.</li>
			<li>
				Shows a banner label and optional detail line. If any rule is active, the banner reflects the
				first active rule; otherwise it shows the OK state.
			</li>
			<li>
				Displays a rule list with <strong>Rule</strong>, <strong>Metric</strong>, <strong>Condition</strong>,
				and <strong>Observed</strong> values, using normal sentence-case labels (no forced all-caps).
			</li>
		</ul>
	</section>
</article>

