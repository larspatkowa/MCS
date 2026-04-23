import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { getInProcessPlugins } from '$lib/server/plugin-registry.js';
import { bootstrapBuiltInPlugins } from '$lib/server/plugins/bootstrap.js';

bootstrapBuiltInPlugins();

export interface AvailablePluginStream {
	id: string;
	name?: string;
	metadata?: Record<string, unknown>;
}

export interface AvailablePlugin {
	id: string;
	name: string;
	path: string;
	type?: 'out-of-process' | 'in-process';
	streams?: AvailablePluginStream[];
	version?: string;
	description?: string;
	capabilities?: string[];
	author?: string;
}

function getInProcessAvailablePlugins(): AvailablePlugin[] {
	return getInProcessPlugins().map((d) => ({
		id: d.id,
		name: d.name,
		path: '',
		type: 'in-process' as const,
		streams: d.streams,
		version: d.version ?? '1.0.0',
		description: d.description,
		capabilities: d.capabilities ?? ['ingest', 'stream-discovery']
	}));
}

function mergeWithInProcessPlugins(fileBased: AvailablePlugin[]): AvailablePlugin[] {
	const inProcess = getInProcessAvailablePlugins();
	if (inProcess.length === 0) return fileBased;
	const seen = new Set(fileBased.map((p) => p.id));
	const merged = [...fileBased];
	for (const plugin of inProcess) {
		if (seen.has(plugin.id)) continue;
		merged.push(plugin);
		seen.add(plugin.id);
	}
	return merged;
}

function scanPluginScriptsInDir(pluginsDir: string): AvailablePlugin[] {
	if (!existsSync(pluginsDir)) return [];
	try {
		const files = readdirSync(pluginsDir);
		const pluginScripts = files.filter((f) => f.endsWith('.mjs') || f.endsWith('.py'));
		return pluginScripts.map((f) => {
			const id = f.replace(/\.(mjs|py)$/, '');
			const name = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
			return {
				id,
				name,
				path: resolve(join(pluginsDir, f)),
				type: 'out-of-process' as const,
				version: '1.0.0',
				capabilities: ['ingest', 'declare-streams', 'batch-ingest']
			};
		});
	} catch {
		return [];
	}
}

/** Later entries win on duplicate ids (same as append order). */
function mergeById(primary: AvailablePlugin[], extra: AvailablePlugin[]): AvailablePlugin[] {
	const map = new Map<string, AvailablePlugin>();
	for (const p of primary) {
		map.set(p.id, p);
	}
	for (const p of extra) {
		map.set(p.id, p);
	}
	return [...map.values()];
}

/**
 * Returns list of available plugins from plugins-config.json in cwd or data dir,
 * or by scanning ../plugins/*.mjs|*.py. Built-in in-process plugins are always merged in.
 */
export function getAvailablePlugins(): AvailablePlugin[] {
	const cwd = process.cwd();
	const configPaths = [join(cwd, 'plugins-config.json'), join(cwd, 'data', 'plugins-config.json')];

	for (const configPath of configPaths) {
		if (existsSync(configPath)) {
			try {
				const raw = readFileSync(configPath, 'utf-8');
				const data = JSON.parse(raw) as { plugins?: AvailablePlugin[] };
				if (Array.isArray(data.plugins) && data.plugins.length > 0) {
					const fromConfig = data.plugins.map((p) => ({
						id: p.id,
						name: p.name || p.id,
						path: p.path ? resolve(p.path) : p.path,
						type: p.type ?? 'out-of-process',
						version: p.version,
						description: p.description,
						capabilities: Array.isArray(p.capabilities) ? p.capabilities : undefined,
						streams: Array.isArray(p.streams) ? p.streams : undefined,
						author: p.author
					}));
					const userDir = join(cwd, 'data', 'user-plugins');
					const mergedFile = mergeById(fromConfig, scanPluginScriptsInDir(userDir));
					return mergeWithInProcessPlugins(mergedFile);
				}
			} catch {
				// fall through to directory scan
			}
		}
	}

	const pluginsDir = join(cwd, '..', 'plugins');
	const userPluginsDir = join(cwd, 'data', 'user-plugins');
	const parentScripts = scanPluginScriptsInDir(pluginsDir);
	const userScripts = scanPluginScriptsInDir(userPluginsDir);
	const combined = mergeById(parentScripts, userScripts);
	if (combined.length > 0) {
		return mergeWithInProcessPlugins(combined);
	}

	return mergeWithInProcessPlugins(userScripts);
}
