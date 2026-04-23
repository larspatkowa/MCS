import type { APIRequestContext, Page, TestInfo } from '@playwright/test';

export async function deleteProject(request: APIRequestContext, projectId: string) {
	await request
		.delete(`/api/projects/${projectId}`, {
			data: { deleteFolder: true }
		})
		.catch(() => {});
}

export function screenshotPath(testInfo: TestInfo, filename: string) {
	return testInfo.outputPath('screenshots', filename);
}

export async function takeScreenshot(
	page: Page,
	testInfo: TestInfo,
	filename: string,
	options: { fullPage?: boolean } = {}
) {
	await page.screenshot({
		path: screenshotPath(testInfo, filename),
		fullPage: options.fullPage
	});
}

