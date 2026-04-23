import { getRunningPlugins } from '$lib/server/plugin-runner.js';
import { getRunningInProcess } from '$lib/server/plugin-registry.js';
import { getAvailablePlugins } from '$lib/server/plugins-config.js';

export interface PluginStream {
	id: string;
	name?: string;
	metadata?: Record<string, unknown>;
}

export interface PluginInfo {
	id: string;
	name: string;
	runtime: 'in-process' | 'process';
	status: 'running' | 'stopped';
	pid?: number;
	path?: string;
	description?: string;
	version?: string;
	streams?: PluginStream[];
}

export interface PluginCatalog {
	plugins: PluginInfo[];
}

export function buildPluginCatalog(): PluginCatalog {
	const available = getAvailablePlugins();
	const runningOutOfProcess = new Map(getRunningPlugins().map((p) => [p.id, p]));
	const runningInProcess = new Map(getRunningInProcess().map((p) => [p.id, p]));

	const plugins: PluginInfo[] = available.map((plugin) => {
		const runtime = plugin.type === 'in-process' ? ('in-process' as const) : ('process' as const);
		const running =
			runtime === 'in-process'
				? runningInProcess.get(plugin.id)
				: runningOutOfProcess.get(plugin.id);
		return {
			id: plugin.id,
			name: plugin.name,
			runtime,
			status: running ? 'running' : 'stopped',
			pid: running?.pid,
			path: plugin.path || undefined,
			description: plugin.description,
			version: plugin.version ?? '1.0.0',
			streams: plugin.streams ?? []
		};
	});

	return { plugins };
}
