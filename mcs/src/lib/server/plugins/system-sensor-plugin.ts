/**
 * system-sensor-plugin.ts
 *
 * In-process plugin that streams live host-machine metrics into MCS.
 * Uses Node.js built-in modules only (os, child_process) — no extra packages.
 * Works on macOS, Linux, and Windows.
 *
 * Streams:
 *   sys:cpu_usage     – aggregate CPU utilisation % (delta between ticks)
 *   sys:cpu_load_1m   – 1-minute load average (UNIX; always 0 on Windows)
 *   sys:mem_used_pct  – RAM used %
 *   sys:mem_used_gb   – RAM used in GiB
 *   sys:disk_used_pct – root-volume disk used %
 *   sys:disk_free_gb  – root-volume disk free in GiB
 *   sys:uptime        – host uptime in hours
 *   sys:location      – {lat, lon, city, country} from public-IP geolocation
 *                       (fetched once on start, refreshed hourly)
 *
 * Update rates:
 *   CPU / Memory : 500 ms  (2 Hz)
 *   Disk / Uptime: 5 s
 *   Location     : on start + every 60 min
 */

import * as os from 'os';
import { spawnSync } from 'child_process';
import { registerInProcess, type InProcessPluginContext } from '$lib/server/plugin-registry.js';
import * as streamsDb from '$lib/server/streams-db.js';
import * as objectsDb from '$lib/server/objects-db.js';
import * as projectChanges from '$lib/server/project-changes.js';
import { getProjectPathById } from '$lib/server/project.js';
import { logger } from '$lib/server/logger.js';

// ── Stream Definitions ────────────────────────────────────────────────────

const TAG = 'system-sensor-plugin';
const TOTAL_GIB = os.totalmem() / 1073741824;

const STREAMS = [
	{ id: 'sys:cpu_usage', name: 'CPU Usage', unit: '%', min: 0, max: 100 },
	{ id: 'sys:cpu_load_1m', name: 'CPU Load (1 min)', unit: '', min: 0, max: os.cpus().length },
	{ id: 'sys:mem_used_pct', name: 'Memory Usage', unit: '%', min: 0, max: 100 },
	{
		id: 'sys:mem_used_gb',
		name: 'Memory Used (GiB)',
		unit: 'GiB',
		min: 0,
		max: Math.ceil(TOTAL_GIB)
	},
	{ id: 'sys:disk_used_pct', name: 'Disk Used', unit: '%', min: 0, max: 100 },
	{ id: 'sys:disk_free_gb', name: 'Disk Free', unit: 'GiB', min: 0, max: 2000 },
	{ id: 'sys:uptime', name: 'System Uptime', unit: 'h', min: 0, max: 99999 },
	{ id: 'sys:location', name: 'Public IP Location', unit: '°', min: -180, max: 180 }
] as const;

// ── CPU Δ-tracking ────────────────────────────────────────────────────────

interface CpuTick {
	user: number;
	sys: number;
	idle: number;
	total: number;
}

function cpuTick(): CpuTick {
	return os.cpus().reduce(
		(a, c) => ({
			user: a.user + c.times.user + c.times.nice,
			sys: a.sys + c.times.sys + c.times.irq,
			idle: a.idle + c.times.idle,
			total: a.total + c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle
		}),
		{ user: 0, sys: 0, idle: 0, total: 0 }
	);
}

function cpuPct(prev: CpuTick, curr: CpuTick): number {
	const dt = curr.total - prev.total;
	if (dt === 0) return 0;
	const idle = curr.idle - prev.idle;
	return Math.round(((dt - idle) / dt) * 1000) / 10;
}

// Disk usage via df (macOS/Linux) or wmic (Windows)

interface DiskInfo {
	usedPct: number;
	freeGib: number;
}

function getDisk(): DiskInfo {
	try {
		if (os.platform() === 'win32') {
			const r = spawnSync(
				'wmic',
				['logicaldisk', 'where', "DeviceID='C:'", 'get', 'Size,FreeSpace', '/value'],
				{ timeout: 3000, encoding: 'utf8' }
			);
			if (r.status !== 0) return { usedPct: 0, freeGib: 0 };
			const out = r.stdout ?? '';
			const free = parseInt(out.match(/FreeSpace=(\d+)/)?.[1] ?? '0');
			const total = parseInt(out.match(/Size=(\d+)/)?.[1] ?? '1');
			return {
				usedPct: Math.round((1 - free / total) * 1000) / 10,
				freeGib: free / 1073741824
			};
		} else {
			// df -k outputs 1 KiB blocks; the data line may wrap on macOS — use last line
			const r = spawnSync('df', ['-k', '/'], { timeout: 3000, encoding: 'utf8' });
			if (r.status !== 0) return { usedPct: 0, freeGib: 0 };
			const lines = (r.stdout ?? '').trim().split('\n');
			const parts = lines[lines.length - 1].split(/\s+/);
			const total = parseInt(parts[1]);
			const used = parseInt(parts[2]);
			const free = parseInt(parts[3]);
			const usedPct = Math.round((used / total) * 1000) / 10;
			return { usedPct: isNaN(usedPct) ? 0 : usedPct, freeGib: free / (1024 * 1024) };
		}
	} catch {
		return { usedPct: 0, freeGib: 0 };
	}
}

// Public-IP geolocation — tries multiple free providers in order

interface GeoInfo {
	lat: number;
	lon: number;
	city: string;
	country: string;
	ip: string;
}

async function tryFetchGeo(
	url: string,
	map: (d: Record<string, unknown>) => GeoInfo | null
): Promise<GeoInfo | null> {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), 6000);
	try {
		const r = await fetch(url, { signal: controller.signal });
		clearTimeout(id);
		if (!r.ok) return null;
		const d = (await r.json()) as Record<string, unknown>;
		return map(d);
	} catch {
		clearTimeout(id);
		return null;
	}
}

async function fetchGeo(): Promise<GeoInfo | null> {
	// Provider 1: ipwho.is (no key, no strict rate-limit)
	const g1 = await tryFetchGeo('https://ipwho.is/', (d) => {
		const lat = Number(d.latitude);
		const lon = Number(d.longitude);
		if (isNaN(lat) || isNaN(lon)) return null;
		return {
			lat,
			lon,
			city: String(d.city ?? ''),
			country: String(d.country ?? ''),
			ip: String(d.ip ?? '')
		};
	});
	if (g1) return g1;

	// Provider 2: ip-api.com (HTTP, free tier, 45 req/min)
	const g2 = await tryFetchGeo(
		'http://ip-api.com/json/?fields=status,lat,lon,city,country,query',
		(d) => {
			if (d.status !== 'success') return null;
			const lat = Number(d.lat);
			const lon = Number(d.lon);
			if (isNaN(lat) || isNaN(lon)) return null;
			return {
				lat,
				lon,
				city: String(d.city ?? ''),
				country: String(d.country ?? ''),
				ip: String(d.query ?? '')
			};
		}
	);
	if (g2) return g2;

	// Provider 3: ipapi.co (fallback)
	const g3 = await tryFetchGeo('https://ipapi.co/json/', (d) => {
		const lat = Number(d.latitude);
		const lon = Number(d.longitude);
		if (isNaN(lat) || isNaN(lon)) return null;
		return {
			lat,
			lon,
			city: String(d.city ?? ''),
			country: String(d.country_name ?? ''),
			ip: String(d.ip ?? '')
		};
	});
	return g3;
}

// ── Object Scaffolding ────────────────────────────────────────────────────

function scaffoldObjects(projectPath: string, rootId: string): void {
	const tree = objectsDb.getObjectTree(projectPath);
	if (!tree) return;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((tree.children as any[])?.find((c: { name: string }) => c.name === 'System Monitor')) return;

	const folder = objectsDb.createObject(projectPath, {
		type: 'folder',
		parentId: rootId,
		name: 'System Monitor',
		notes: `Auto-created by the System Sensor Plugin.\nHost: ${os.hostname()} · ${os.platform()} · ${os.cpus().length} cores · ${TOTAL_GIB.toFixed(1)} GiB RAM`
	});

	// Line plot: CPU + memory
	objectsDb.createObject(projectPath, {
		type: 'line-plot',
		parentId: folder.id,
		name: 'CPU & Memory',
		props: {
			dataSources: ['sys:cpu_usage', 'sys:mem_used_pct'],
			seriesNames: ['CPU Usage (%)', 'Memory Used (%)'],
			colors: ['#4f9cf9', '#f0883e'],
			windowSec: 120
		}
	});

	// Gauge: CPU — high is bad, no lower threshold
	objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'CPU Usage',
		props: {
			dataSource: 'sys:cpu_usage',
			displayType: 'dial',
			min: 0,
			max: 100,
			unit: '%',
			label: 'CPU Usage',
			thresholdMax: 80,
			arcColor: '#4f9cf9',
			warningColor: '#f59e0b',
			alarmColor: '#ef4444',
			precision: 1
		}
	});

	// Gauge: memory — high is bad
	objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Memory Used',
		props: {
			dataSource: 'sys:mem_used_pct',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			label: 'Memory Used',
			thresholdMax: 85,
			arcColor: '#f0883e',
			warningColor: '#f59e0b',
			alarmColor: '#ef4444',
			precision: 1
		}
	});

	// Gauge: disk — high is bad
	objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Disk Used',
		props: {
			dataSource: 'sys:disk_used_pct',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			label: 'Disk Used (/)',
			thresholdMax: 90,
			arcColor: '#a78bfa',
			warningColor: '#f59e0b',
			alarmColor: '#ef4444',
			precision: 1
		}
	});

	// Telemetry table: all numeric streams
	objectsDb.createObject(projectPath, {
		type: 'telemetry-table',
		parentId: folder.id,
		name: 'System Metrics',
		props: {
			columns: [
				{ streamId: 'sys:cpu_usage', label: 'CPU (%)' },
				{ streamId: 'sys:cpu_load_1m', label: 'Load 1m' },
				{ streamId: 'sys:mem_used_pct', label: 'Mem (%)' },
				{ streamId: 'sys:mem_used_gb', label: 'Mem Used (GiB)' },
				{ streamId: 'sys:disk_used_pct', label: 'Disk (%)' },
				{ streamId: 'sys:disk_free_gb', label: 'Disk Free (GiB)' },
				{ streamId: 'sys:uptime', label: 'Uptime (h)' }
			],
			maxRows: 500,
			pollMs: 1000
		}
	});

	// Map view — populates once geolocation fetch completes
	objectsDb.createObject(projectPath, {
		type: 'map-view',
		parentId: folder.id,
		name: 'My Location',
		props: {
			gpsStreamId: 'sys:location',
			baseLayer: 'osm',
			showGpsTrail: false,
			showInspector: true,
			zoom: 10
		}
	});

	logger.info(TAG, 'Scaffolded System Monitor objects', { folderId: folder.id });
}

// ── Plugin Registration ───────────────────────────────────────────────────

export function registerSystemSensorPlugin(): void {
	registerInProcess({
		id: 'system-sensor',
		name: 'System Sensor',
		type: 'in-process',
		version: '1.1.0',
		description:
			'Streams live host-machine metrics (CPU, memory, disk, uptime, location) using Node.js built-in modules. No extra packages required. Runs on macOS, Linux, and Windows.',
		capabilities: ['streams', 'objects'],
		streams: STREAMS.map((s) => ({
			id: s.id,
			name: s.name,
			metadata: { unit: s.unit, min: s.min, max: s.max }
		})),

		run(ctx: InProcessPluginContext) {
			const projectPath = getProjectPathById(ctx.projectId);
			if (!projectPath) {
				logger.warn(TAG, 'Project not found — cannot start plugin', { projectId: ctx.projectId });
				return;
			}

			// Declare all streams in SQLite
			for (const s of STREAMS) {
				streamsDb.ensureStream(projectPath, s.id, s.name);
				streamsDb.updateStreamMetadata(projectPath, s.id, {
					unit: s.unit,
					min: s.min,
					max: s.max,
					source: TAG
				});
			}

			// Scaffold objects (idempotent — checks for existing folder)
			const tree = objectsDb.getObjectTree(projectPath);
			if (tree) {
				scaffoldObjects(projectPath, tree.id);
				// In-process scaffolding bypasses the API layer, so emit a change event for the UI Explorer.
				projectChanges.notify(ctx.projectId, { type: 'tree-changed' });
			}

			logger.info(TAG, 'Started', {
				projectId: ctx.projectId,
				platform: os.platform(),
				cpuCount: os.cpus().length,
				totalRam: `${TOTAL_GIB.toFixed(1)} GiB`
			});

			// CPU delta tracking
			let prevCpu = cpuTick();

			// Fast loop: CPU + memory at 2 Hz (500 ms)
			const fastTimer = setInterval(() => {
				try {
					const currCpu = cpuTick();
					const usage = cpuPct(prevCpu, currCpu);
					prevCpu = currCpu;

					const [load1] = os.loadavg();
					const freeGib = os.freemem() / 1073741824;
					const usedGib = TOTAL_GIB - freeGib;
					const usedPct = Math.round((usedGib / TOTAL_GIB) * 1000) / 10;

					ctx.ingest('sys:cpu_usage', { value: usage });
					ctx.ingest('sys:cpu_load_1m', { value: Math.round(load1 * 100) / 100 });
					ctx.ingest('sys:mem_used_pct', { value: usedPct });
					ctx.ingest('sys:mem_used_gb', { value: Math.round(usedGib * 100) / 100 });
				} catch (e) {
					logger.exception(TAG, 'Fast-loop error', e);
				}
			}, 500);

			// Slow loop: disk + uptime every 5 s
			const slowTimer = setInterval(() => {
				try {
					const disk = getDisk();
					ctx.ingest('sys:disk_used_pct', { value: disk.usedPct });
					ctx.ingest('sys:disk_free_gb', { value: Math.round(disk.freeGib * 100) / 100 });
					// os.uptime() is seconds; convert to hours (2 dp)
					ctx.ingest('sys:uptime', { value: Math.round(os.uptime() / 36) / 100 });
				} catch (e) {
					logger.exception(TAG, 'Slow-loop error', e);
				}
			}, 5000);

			// Geolocation: once on start + hourly refresh
			let geoTimer: ReturnType<typeof setInterval> | null = null;
			async function ingestLocation() {
				try {
					const geo = await fetchGeo();
					if (geo) {
						ctx.ingest('sys:location', {
							lat: geo.lat,
							lon: geo.lon,
							city: geo.city,
							country: geo.country
						});
						logger.info(TAG, `Location: ${geo.city}, ${geo.country} (${geo.ip})`);
					} else {
						logger.warn(TAG, 'All geo providers failed — location stream will have no data');
					}
				} catch (e) {
					logger.exception(TAG, 'Geo fetch error', e);
				}
			}
			// 2-second delay so network is ready
			setTimeout(() => {
				void ingestLocation();
			}, 2000);
			geoTimer = setInterval(
				() => {
					void ingestLocation();
				},
				60 * 60 * 1000
			);

			ctx.onStop = () => {
				clearInterval(fastTimer);
				clearInterval(slowTimer);
				if (geoTimer) clearInterval(geoTimer);
				logger.info(TAG, 'Stopped');
			};
		}
	});
}
