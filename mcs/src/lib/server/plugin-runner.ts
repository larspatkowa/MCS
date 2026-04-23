import { spawn } from 'child_process';
import { extname } from 'path';
import { logger } from '$lib/server/logger.js';

const running = new Map<string, { pid: number; projectId: string }>();

export interface PluginConfig {
	id: string;
	name: string;
	path: string;
	projectId?: string;
}

function resolveRuntime(pluginPath: string): {
	command: string;
	args: string[];
	runtime: 'node' | 'python';
} {
	const ext = extname(pluginPath).toLowerCase();
	if (ext === '.py') {
		const pythonBin = process.env.MCS_PYTHON_BIN || 'python3';
		return {
			command: pythonBin,
			args: [pluginPath],
			runtime: 'python'
		};
	}
	return {
		command: process.execPath,
		args: [pluginPath],
		runtime: 'node'
	};
}

export function startPlugin(
	config: PluginConfig,
	env: { apiUrl: string; projectId: string }
): Promise<{ pid: number }> {
	return new Promise((resolve, reject) => {
		const key = config.id;
		if (running.has(key)) {
			return reject(new Error('Plugin already running'));
		}
		const runtime = resolveRuntime(config.path);
		const child = spawn(runtime.command, runtime.args, {
			env: {
				...process.env,
				MCS_API_URL: env.apiUrl,
				MCS_PROJECT_ID: env.projectId,
				MCS_PLUGIN_ID: config.id,
				MCS_PLUGIN_RUNTIME: runtime.runtime
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.on('error', (err) => {
			running.delete(key);
			logger.exception('plugin-runner', 'Plugin process error', err, { pluginId: config.id });
			reject(err);
		});
		child.on('spawn', () => {
			running.set(key, { pid: child.pid ?? 0, projectId: env.projectId });
			logger.info('plugin-runner', 'Plugin started', {
				pluginId: config.id,
				pid: child.pid,
				runtime: runtime.runtime
			});
			resolve({ pid: child.pid ?? 0 });
		});
		child.on('exit', (code, signal) => {
			running.delete(key);
			logger.info('plugin-runner', 'Plugin exited', { pluginId: config.id, code, signal });
		});
		// Forward plugin stdout/stderr to MCS logger at debug level
		child.stdout?.on('data', (chunk: Buffer) => {
			logger.debug('plugin-runner', `[${config.id}] ${chunk.toString().trim()}`);
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			logger.warn('plugin-runner', `[${config.id}] ${chunk.toString().trim()}`);
		});
	});
}

export function stopPlugin(id: string): boolean {
	const entry = running.get(id);
	if (!entry) return false;
	try {
		process.kill(entry.pid, 'SIGTERM');
		running.delete(id);
		logger.info('plugin-runner', 'Plugin stopped', { pluginId: id, pid: entry.pid });
		return true;
	} catch (err) {
		running.delete(id);
		logger.exception('plugin-runner', 'Failed to stop plugin', err, {
			pluginId: id,
			pid: entry.pid
		});
		return false;
	}
}

export interface RunningPluginInfo {
	id: string;
	pid: number;
}

export function getRunningPlugins(): RunningPluginInfo[] {
	return [...running.entries()].map(([id, info]) => ({ id, pid: info.pid }));
}

export function isPluginRunning(id: string): boolean {
	return running.has(id);
}

export function stopPluginsForProject(projectId: string): number {
	let stopped = 0;
	for (const [id, info] of running.entries()) {
		if (info.projectId !== projectId) continue;
		if (stopPlugin(id)) stopped += 1;
	}
	return stopped;
}
