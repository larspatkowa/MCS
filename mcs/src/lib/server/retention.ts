import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig } from './config.js';
import { projectDbExists } from './db.js';
import { readManifest } from './project.js';
import { purgeExpiredHistory } from './streams-db.js';
import { logger } from './logger.js';

const DEFAULT_RETENTION_DAYS = 30;
const BATCH_SIZE = 5_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let started = false;

function retentionDays(settings: Record<string, unknown> | undefined): number {
	const configured = settings?.telemetryRetentionDays;
	return typeof configured === 'number' &&
		Number.isInteger(configured) &&
		configured >= 1 &&
		configured <= 3650
		? configured
		: DEFAULT_RETENTION_DAYS;
}

function schedule(delayMs: number): void {
	if (!started) return;
	if (timer) clearTimeout(timer);
	timer = setTimeout(() => void cleanExpiredHistory(), delayMs);
	timer.unref?.();
}

async function cleanExpiredHistory(): Promise<void> {
	if (running) return;
	running = true;
	let more = false;
	try {
		const paths = [...new Set(loadConfig().recentProjectPaths.map((path) => resolve(path)))];
		for (const projectPath of paths) {
			if (!existsSync(join(projectPath, 'project.json')) || !projectDbExists(projectPath)) continue;
			const manifest = readManifest(projectPath);
			if (!manifest) continue;
			const cutoff = Date.now() / 1000 - retentionDays(manifest.settings) * 86_400;
			const removed = purgeExpiredHistory(projectPath, cutoff, BATCH_SIZE);
			if (removed === BATCH_SIZE) more = true;
		}
	} catch (error) {
		logger.exception('retention', 'Telemetry history cleanup failed', error);
		more = true;
	} finally {
		running = false;
		schedule(more ? 250 : 24 * 60 * 60 * 1000);
	}
}

/** Start asynchronous, bounded cleanup once per server process. */
export function startTelemetryRetentionCleanup(): void {
	if (started) return;
	started = true;
	schedule(1000);
}

export function stopTelemetryRetentionCleanup(): void {
	started = false;
	if (timer) clearTimeout(timer);
	timer = null;
}
