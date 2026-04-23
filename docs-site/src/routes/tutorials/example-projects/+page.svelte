<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CodeBlock from '$lib/components/CodeBlock.svelte';
	import Callout from '$lib/components/Callout.svelte';
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';
	import { docTitle } from '$lib/nav.js';

	const exampleFlow = `flowchart LR
    Template["Example project template"]
    Manifest["project.json settings"]
    Source["Built-in source or connector"]
    Streams["Declared streams + samples"]
    Objects["Scaffolded folder + objects"]
    Views["Plots, gauges, maps, tables"]
    Ingest["POST /api/ingest"]
    Editor["/plugin-editor or external script"]
    Custom["Custom object type"]

    Template --> Manifest
    Manifest --> Source
    Source --> Streams
    Source --> Objects
    Streams --> Views
    Objects --> Views
    Ingest --> Streams
    Editor --> Ingest
    Custom --> Views`;

	const ingestExample = `curl -X POST http://localhost:6000/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "streamId": "rocket:altitude",
    "values": { "value": 184.2 }
  }'`;

	const startExample = `curl -X POST http://localhost:6000/api/plugins/start \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "rocket-mission",
    "projectId": "YOUR_PROJECT_ID"
  }'`;

	const customTypeExample = [
		"// mcs/src/lib/object-types/bootstrap.ts",
		"import { BellRing } from '@lucide/svelte';",
		"import AlarmStripProps from '$lib/components/properties/AlarmStripProps.svelte';",
		"import { registerType } from './registry.js';",
		"import { registerView, lazy } from './views.js';",
		"import { registerPropertyEditor } from './property-editors.js';",
		'',
		"registerType('alarm-strip', {",
		"  label: 'Alarm Strip',",
		'  icon: BellRing,',
		"  group: 'Data',",
		'  creatable: true,',
		"  defaultProps: { streamId: 'ops:alarm' }",
		'});',
		'',
		"registerView('alarm-strip', lazy(() => import('$lib/components/center/AlarmStripView.svelte')));",
		"registerPropertyEditor('alarm-strip', AlarmStripProps);"
	].join('\n');

	const examples = [
		{
			name: 'Agriculture',
			source: 'agri-ndvi-mission',
			streams: ['agri:field_ndvi', 'agri:target_ndvi', 'agri:soil_moisture', 'agri:gps'],
			displays: ['map-view', 'overlay-plot', 'gauge', 'telemetry-table', 'gantt-chart'],
			summary:
				'Sentinel-2 (10m) NDVI overlay over the configured bbox, a clustered green-enough coverage path (scanlines per green region), and a bottom row that splits vegetation/thermal, mission metrics, and the survey timeline side-by-side. The simulated drone GPS follows that path closely.'
		},
		{
			name: 'System Monitor',
			source: 'system-sensor',
			streams: ['sys:cpu_usage', 'sys:mem_used_pct', 'sys:disk_used_pct', 'sys:location'],
			displays: ['line-plot', 'gauge', 'telemetry-table', 'map-view'],
			summary: 'The fastest path to live telemetry. Good for validating the full pipeline without any setup.'
		}
	];
</script>

<svelte:head>
	<title>{docTitle('Example projects')}</title>
</svelte:head>

<PageHeader
	title="Example projects"
	badge="Tutorial"
	description="The built-in examples are working reference systems. Each one pairs a source, a stream set, and a display layout so you can see the whole chain in one place."
/>

<article class="doc-page walkthrough-page">
	<section>
		<p class="doc-lead">
			Example projects are not static mockups. Each one has a project manifest, source settings,
			stream ids, and scaffolded objects that you can inspect, edit, replace, or extend.
		</p>
		<Callout type="info" title="Explorer refresh">
			The Explorer updates automatically once the example project's plugin scaffolding finishes. If you ever see only the
			root node briefly, give it a moment; it should populate without reopening the project.
		</Callout>
		<Callout type="info" title="Tour starts automatically">
			When you create an example project, MCS opens a short walkthrough tailored to that example. You can rerun it any
			time via <strong>Take a project tour</strong> on the project root screen.
		</Callout>
		<Callout type="info" title="Start at the project root">
			Open the project root first. That screen is the quickest overview of the source, the streams
			that matter, and the displays already wired together.
		</Callout>
		<Callout type="tip" title="If the project looks empty">
			Example projects scaffold their demo folder the first time you start the matching source. If you do not see the
			scaffolded folder yet, start the source (root screen or Settings → Data sources) and then open the newest folder in
			the Explorer.
		</Callout>
		<Callout type="tip" title="Deleting a project stops its sources">
			If you delete an example project, any sources you started for it are stopped automatically so they
			do not keep running in the background.
		</Callout>
		<Callout type="tip" title="Hover charts to inspect values">
			Time plots, overlay plots, bar charts, and scatter plots support hover inspection. On touch and pen
			input, drag within the plot area to scrub.
		</Callout>
	</section>

	<section>
		<MermaidDiagram
			diagram={exampleFlow}
			caption="The examples are regular MCS projects. The only special part is that the manifest already knows which source to use and which walkthrough copy to show."
		/>
	</section>

	<section>
		<h2>What each example teaches</h2>
		<div class="example-grid">
			{#each examples as example}
				<article class="example-card">
					<div class="example-head">
						<h3>{example.name}</h3>
						<p>{example.summary}</p>
					</div>
					<div class="example-row">
						<span>source</span>
						<code>{example.source}</code>
					</div>
					<div class="example-row">
						<span>streams</span>
						<div class="chip-row">
							{#each example.streams as stream}
								<code>{stream}</code>
							{/each}
						</div>
					</div>
					<div class="example-row">
						<span>displays</span>
						<div class="chip-row chip-row-text">
							{#each example.displays as display}
								<span>{display}</span>
							{/each}
						</div>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section>
		<h2>Follow the walkthrough</h2>
		<ol>
			<li>Open the example project and keep the project root selected.</li>
			<li>Read the source, stream, and display summary at the top of the root screen.</li>
			<li>Start or restart the source from the root screen or from Settings → Data sources.</li>
			<li>Open the scaffolded folder in the Explorer to inspect how the views are grouped.</li>
			<li>Swap in your own samples or add another object once you understand the layout.</li>
		</ol>
	</section>

	<section>
		<h2>Feed your own data</h2>
		<p>
			All example projects accept direct ingest. If your stream ids match what a view already uses,
			the display updates immediately. If they do not, create a new object and point it at the new
			stream.
		</p>
		<CodeBlock lang="bash" title="Send a sample into an existing example view" code={ingestExample} />
	</section>

	<section>
		<h2>Write or run a plugin</h2>
		<p>
			The examples use built-in in-process sources, but the control surface is the same for external
			connectors. You still start them per project and they still feed the same ingest path.
		</p>
		<CodeBlock lang="bash" title="Start a source for a project" code={startExample} />
		<p>
			Use <a href="/tutorials/first-plugin">Write your first plugin</a> for in-process work, or
			<a href="/tutorials/plugin-editor">In-app plugin editor</a> for Node and Python scripts.
		</p>
	</section>

	<section>
		<h2>Add a custom component</h2>
		<p>
			Use a custom component when the data already exists but the built-in displays are not the right
			fit. Custom views are registered in the object-type bootstrap and then appear in the Add Object
			flow like any other built-in type.
		</p>
		<CodeBlock lang="typescript" title="Register a custom object type" code={customTypeExample} />
		<Callout type="tip" title="Split the work cleanly">
			Use plugins when you need new data. Use custom views when the data exists but the display does
			not.
		</Callout>
	</section>
</article>

<style>
	.walkthrough-page {
		gap: 2rem;
	}

	.example-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
	}

	.example-card {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1rem;
		border: 1px solid var(--docs-border);
		background: var(--docs-surface-strong);
	}

	.example-head {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.example-head p {
		font-size: 0.94rem;
		line-height: 1.6;
	}

	.example-row {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--docs-border);
	}

	.example-row > span:first-child {
		font-size: 0.78rem;
		font-family: var(--docs-font-mono);
		letter-spacing: 0.04em;
		color: var(--docs-text-muted);
	}

	.chip-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.chip-row :global(code),
	.chip-row-text span {
		display: inline-flex;
		padding: 0.18rem 0.42rem;
		border: 1px solid var(--docs-border);
		background: var(--docs-surface);
	}

	.chip-row-text span {
		font-size: 0.8rem;
		color: var(--docs-text-soft);
	}

	@media (max-width: 980px) {
		.example-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
