import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { loadConfig, addRecentProject } from '$lib/server/config.js';
import {
	createProject,
	readManifest,
	writeManifest,
	getManifestPath
} from '$lib/server/project.js';
import { logger } from '$lib/server/logger.js';

const DEMO_FOLDER = 'Rocket-Mission-Demo';
const DEMO_NAME = 'Rocket Mission Demo';

let firstRunChecked = false;

/**
 * On first server use (no projects in recents), create a demo project with
 * rocket-mission auto-start so opening the app shows live data immediately.
 */
export function ensureFirstRunDemoProject(): void {
	if (firstRunChecked) return;
	firstRunChecked = true;

	// Keep the Rocket demo project code in-tree, but don't seed it by default.
	// Re-enable later by flipping this flag (or replacing with config/env wiring).
	const ENABLE_ROCKET_FIRST_RUN_DEMO = false;
	if (!ENABLE_ROCKET_FIRST_RUN_DEMO) return;

	const config = loadConfig();
	if (config.recentProjectPaths.length > 0) {
		return;
	}

	const cwd = process.cwd();
	const demoPath = resolve(join(cwd, 'data', 'projects', DEMO_FOLDER));

	try {
		if (existsSync(getManifestPath(demoPath))) {
			const manifest = readManifest(demoPath);
			if (manifest) {
				addRecentProject(demoPath);
				logger.info('first-run', 'Re-linked existing demo project to recents', { path: demoPath });
			}
			return;
		}

		const manifest = createProject(
			demoPath,
			DEMO_NAME,
			'Auto-created on first launch. The rocket simulation starts when you open this project.'
		);
		writeManifest(demoPath, {
			...manifest,
			settings: {
				autoStartPlugins: ['rocket-mission'],
				tutorialExampleKind: 'rocket'
			}
		});
		logger.info('first-run', 'Created default Rocket Mission Demo project', {
			path: demoPath,
			id: manifest.id
		});
	} catch (e) {
		logger.exception('first-run', 'Failed to seed demo project', e);
	}
}
