import { test, expect } from "@playwright/test";

const pages = [
  { path: "/", title: "Getting started | MCS Documentation" },
  { path: "/components", title: "Components | MCS Documentation" },
  { path: "/components/grid-layout", title: "Grid Layout | MCS Documentation" },
  { path: "/components/flex-layout", title: "Flex Layout | MCS Documentation" },
  { path: "/components/gauge", title: "Gauge | MCS Documentation" },
  { path: "/configuration", title: "Configuration | MCS Documentation" },
  { path: "/architecture", title: "Architecture | MCS Documentation" },
  { path: "/api/ingest", title: "Ingest API | MCS Documentation" },
  { path: "/api/projects", title: "Projects API | MCS Documentation" },
  { path: "/api/objects", title: "Objects API | MCS Documentation" },
  { path: "/api/streams", title: "Streams API | MCS Documentation" },
  { path: "/api/runs", title: "Runs API | MCS Documentation" },
  { path: "/components/mission-views", title: "Mission views | MCS Documentation" },
  { path: "/guides/agents", title: "AI agents (MCP) | MCS Documentation" },
  { path: "/guides/open-mct", title: "Compared with Open MCT | MCS Documentation" },
];

for (const { path, title } of pages) {
  test(`${path} loads with correct title`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
}
