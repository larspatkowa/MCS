<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Callout from "$lib/components/Callout.svelte";
  import { docTitle } from "$lib/nav.js";

  const componentLinks: Record<string, string> = {
    folder: "/components/folder",
    "grid-layout": "/components/grid-layout",
    "flex-layout": "/components/flex-layout",
    "line-plot": "/components/line-plot",
    gauge: "/components/gauge",
    "telemetry-table": "/components/telemetry-table",
    "markdown-note": "/components/markdown-note",
    image: "/components/media",
    "video-stream": "/components/media",
  };

  const groups = [
    {
      name: "Containers",
      items: [
        ["folder", "Groups objects in the sidebar tree."],
        ["grid-layout", "Fixed-position dashboard grid."],
        ["flex-layout", "Resizable split panes."],
      ],
    },
    {
      name: "Charts",
      items: [["line-plot", "Plot timestamped values from telemetry streams."]],
    },
    {
      name: "Values",
      items: [
        ["gauge", "Show a current value from a stream."],
        ["telemetry-table", "Tabular stream readout."],
      ],
    },
    {
      name: "Content",
      items: [["markdown-note", "Markdown document inside the project tree."]],
    },
    {
      name: "Media",
      items: [
        ["image", "Project-owned image asset for a static display."],
        [
          "video-stream",
          "Video media track that can follow run replay.",
        ],
      ],
    },
  ];
</script>

<svelte:head>
  <title>{docTitle("Components")}</title>
</svelte:head>

<PageHeader
  title="Components"
  description="These are the built-in object types available in a project."
/>

<article class="doc-page">
  <section>
    <p class="doc-lead">
      These are the built-in display and layout object types available to a
      project.
    </p>
    <Callout type="info" title="Scope">
      This page tracks the types exposed in <code
        >mcs/src/lib/object-types/bootstrap.ts</code
      >. It does not try to cover every internal union member or legacy helper.
    </Callout>
  </section>

  {#each groups as group}
    <section>
      <h2>{group.name}</h2>
      <table>
        <thead>
          <tr><th>Type id</th><th>Use</th></tr>
        </thead>
        <tbody>
          {#each group.items as [typeId, description]}
            <tr>
              <td>
                {#if componentLinks[typeId]}
                  <a href={componentLinks[typeId]}><code>{typeId}</code></a>
                {:else}
                  <code>{typeId}</code>
                {/if}
              </td>
              <td>{description}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
</article>
