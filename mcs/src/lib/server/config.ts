import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

export interface MCSConfig {
	recentProjectPaths: string[];
	defaultProjectPath?: string;
}

// Simple in-memory cache so we don't re-read and re-parse config.json
// on every API call during a page load.
let cachedConfig: MCSConfig | null = null;
let cachedConfigPath: string | null = null;

/** Clear config cache (for tests). */
export function clearConfigCache(): void {
	cachedConfig = null;
	cachedConfigPath = null;
}

function getConfigDir(): string {
	return process.env.MCS_CONFIG_DIR ?? join(process.cwd(), 'data');
}

function ensureConfigDir(configDir: string = getConfigDir()): void {
	if (!existsSync(configDir)) {
		mkdirSync(configDir, { recursive: true });
	}
}

export function getConfigPath(): string {
	return join(getConfigDir(), 'config.json');
}

export function loadConfig(): MCSConfig {
	const configPath = getConfigPath();
	if (cachedConfig && cachedConfigPath === configPath) {
		return cachedConfig;
	}

	ensureConfigDir();
	if (!existsSync(configPath)) {
		cachedConfig = { recentProjectPaths: [] };
		cachedConfigPath = configPath;
		return cachedConfig;
	}
	try {
		const raw = readFileSync(configPath, 'utf-8');
		const data = JSON.parse(raw) as MCSConfig;
		// Normalize all paths when loading (migration for old data)
		const normalizedPaths = Array.isArray(data.recentProjectPaths)
			? data.recentProjectPaths.map((p) => resolve(p))
			: [];
		const normalizedDefaultPath = data.defaultProjectPath
			? resolve(data.defaultProjectPath)
			: undefined;

		// If paths were normalized, save the config back with normalized paths
		const needsUpdate =
			normalizedPaths.some((np, i) => np !== data.recentProjectPaths[i]) ||
			normalizedDefaultPath !== data.defaultProjectPath;

		if (needsUpdate) {
			const updatedConfig: MCSConfig = {
				recentProjectPaths: normalizedPaths,
				defaultProjectPath: normalizedDefaultPath
			};
			saveConfig(updatedConfig);
			cachedConfig = updatedConfig;
			cachedConfigPath = configPath;
			return updatedConfig;
		}

		cachedConfig = {
			recentProjectPaths: normalizedPaths,
			defaultProjectPath: normalizedDefaultPath
		};
		cachedConfigPath = configPath;
		return cachedConfig;
	} catch {
		cachedConfig = { recentProjectPaths: [] };
		cachedConfigPath = configPath;
		return cachedConfig;
	}
}

export function saveConfig(config: MCSConfig): void {
	const configPath = getConfigPath();
	ensureConfigDir();
	writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
	cachedConfig = config;
	cachedConfigPath = configPath;
}

export function addRecentProject(path: string): void {
	const config = loadConfig();
	const normalized = resolve(path);
	const without = config.recentProjectPaths.filter((p) => resolve(p) !== normalized);
	config.recentProjectPaths = [normalized, ...without].slice(0, 20);
	saveConfig(config);
}

export function setDefaultProject(path: string | undefined): void {
	const config = loadConfig();
	config.defaultProjectPath = path ? resolve(path) : undefined;
	saveConfig(config);
}

export function removeRecentProject(path: string): void {
	const config = loadConfig();
	const normalized = resolve(path);
	config.recentProjectPaths = config.recentProjectPaths.filter((p) => resolve(p) !== normalized);
	if (config.defaultProjectPath && resolve(config.defaultProjectPath) === normalized) {
		config.defaultProjectPath = undefined;
	}
	saveConfig(config);
}
