import { performIngest } from '$lib/server/ingest-core.js';
import { getProjectPathById } from '$lib/server/project.js';

export interface InProcessPluginStream {
	id: string;
	name?: string;
	metadata?: Record<string, unknown>;
}

export interface InProcessPluginContext {
	projectId: string;
	ingest: (streamId: string, values: Record<string, unknown>) => void;
	onStop?: () => void;
}

export interface InProcessPluginDescriptor {
	id: string;
	name: string;
	type: 'in-process';
	version?: string;
	description?: string;
	capabilities?: string[];
	streams?: InProcessPluginStream[];
	run: (ctx: InProcessPluginContext) => void | Promise<void>;
}

const descriptors = new Map<string, InProcessPluginDescriptor>();
const running = new Map<string, { projectId: string; onStop?: () => void }>();

export function registerInProcess(descriptor: InProcessPluginDescriptor): void {
	descriptors.set(descriptor.id, descriptor);
}

export function unregisterInProcess(id: string): void {
	descriptors.delete(id);
	stopInProcess(id);
}

export function getInProcessPlugins(): InProcessPluginDescriptor[] {
	return [...descriptors.values()];
}

export function startInProcess(id: string, projectId: string): void {
	const existing = running.get(id);
	if (existing) {
		// In-process plugins are globally single-instance today. If the same plugin is requested
		// for a different project (e.g. opening another demo project), restart it so the caller
		// actually receives data.
		if (existing.projectId !== projectId) {
			stopInProcess(id);
		} else {
			throw new Error('Plugin already running');
		}
	}
	const descriptor = descriptors.get(id);
	if (!descriptor) {
		throw new Error('Plugin not found');
	}
	// Insert before run() so we can stop during startup.
	running.set(id, { projectId, onStop: undefined });

	let onStop: (() => void) | undefined;
	let stoppedForMissingProject = false;
	const ctx: InProcessPluginContext = {
		projectId,
		ingest(streamId: string, values: Record<string, unknown>) {
			// If the project was deleted while the plugin is running, stop the plugin
			// to avoid spamming logs from ingest attempts into a non-existent project.
			if (!getProjectPathById(projectId)) {
				if (!stoppedForMissingProject) {
					stoppedForMissingProject = true;
					stopInProcess(id);
				}
				return;
			}
			performIngest(projectId, streamId, Date.now() / 1000, values);
		},
		get onStop() {
			return onStop;
		},
		set onStop(fn: (() => void) | undefined) {
			onStop = fn;
			const entry = running.get(id);
			if (entry) entry.onStop = fn;
		}
	};
	try {
		descriptor.run(ctx);
	} catch {
		// If startup throws, remove the entry so the plugin can be started again.
		running.delete(id);
		throw new Error('Failed to start');
	}
}

export function stopInProcess(id: string): boolean {
	const entry = running.get(id);
	if (!entry) return false;
	try {
		entry.onStop?.();
	} catch {
		// ignore
	}
	running.delete(id);
	return true;
}

export function stopInProcessForProject(projectId: string): number {
	let stopped = 0;
	for (const [id, entry] of running.entries()) {
		if (entry.projectId !== projectId) continue;
		if (stopInProcess(id)) stopped += 1;
	}
	return stopped;
}

export function getRunningInProcess(): { id: string; pid: number }[] {
	return [...running.keys()].map((id) => ({ id, pid: 0 }));
}

export function isInProcessPlugin(id: string): boolean {
	return descriptors.has(id);
}
