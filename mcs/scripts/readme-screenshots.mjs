import { chromium } from '@playwright/test';

const baseUrl = process.env.MCS_BASE_URL ?? 'http://localhost:6000';
const outDir = process.env.MCS_SCREENSHOT_DIR ?? new URL('../static/readme/', import.meta.url).pathname;

async function waitForAppReady(page) {
	await page.waitForLoadState('domcontentloaded');
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(300);
}

async function screenshot(page, name) {
	await page.waitForTimeout(600);
	await page.screenshot({
		path: `${outDir}${name}.png`,
		fullPage: false
	});
}

async function createFromTemplate(page, exampleTitle) {
	await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
	await waitForAppReady(page);
	await page.locator('#example-projects-toggle').click();
	await page.locator('.examples-panel .example-row', { hasText: exampleTitle }).first().click();
	await page.waitForURL(/\/project\/[^/]+/, { timeout: 60_000 });
	await waitForAppReady(page);
}

async function dismissTutorialIfPresent(page) {
	const tutorialRoot = page.locator('.tutorial-root');
	if (!(await tutorialRoot.isVisible().catch(() => false))) return;
	const dismissButton = page.getByRole('button', { name: /skip|dismiss|close|end|done/i }).first();
	if (await dismissButton.isVisible().catch(() => false)) {
		await dismissButton.click().catch(() => {});
	}
	await page.keyboard.press('Escape').catch(() => {});
	await page.keyboard.press('Escape').catch(() => {});
	await page
		.locator('.tutorial-root .veil-full')
		.waitFor({ state: 'detached', timeout: 5000 })
		.catch(() => {});
}

/** Opens a tree node by exact label (layout or folder child). */
async function openTreeItem(page, label) {
	const locator = page.getByText(label, { exact: true }).first();
	await locator.scrollIntoViewIfNeeded();
	await locator.click();
	await waitForAppReady(page);
}

async function run() {
	const browser = await chromium.launch();
	let ctx;
	try {
		ctx = await browser.newContext({
			viewport: { width: 1920, height: 1080 },
			deviceScaleFactor: 1
		});
		const page = await ctx.newPage();

		// Full app chrome + flex layout dashboard (not /gallery single-object preview)
		await createFromTemplate(page, 'Rocket Mission');
		await dismissTutorialIfPresent(page);
		await openTreeItem(page, 'Mission layout');
		await screenshot(page, 'rocket-mission-layout');

		await createFromTemplate(page, 'Agriculture');
		await dismissTutorialIfPresent(page);
		await openTreeItem(page, 'Field layout');
		await screenshot(page, 'agriculture-field-layout');

		await page.setViewportSize({ width: 1440, height: 900 });
		await waitForAppReady(page);
		await screenshot(page, 'agriculture-field-layout-narrow');
	} finally {
		await ctx?.close().catch(() => {});
		await browser.close().catch(() => {});
	}
}

run().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exitCode = 1;
});
