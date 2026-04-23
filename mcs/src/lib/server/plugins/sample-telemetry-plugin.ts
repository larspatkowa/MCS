/**
 * sample-telemetry-plugin.ts
 *
 * Built-in in-process plugin that feeds realistic simulated telemetry into the
 * MCS ingest pipeline. When started, it:
 *   1. Declares six telemetry streams with metadata (units, ranges, display names).
 *   2. Scaffolds a "Sample Telemetry" folder with pre-configured objects in the project.
 *   3. Runs a 1 Hz ingest loop producing sine, ramp, step, random, and GPS data
 *      until stopped.
 *
 * All data flows through the same `performIngest → SQLite → SSE` pipeline used by
 * external plugins so the UI can consume it via SSE subscriptions or REST queries.
 */

import { registerInProcess, type InProcessPluginContext } from '$lib/server/plugin-registry.js';
import * as streamsDb from '$lib/server/streams-db.js';
import * as objectsDb from '$lib/server/objects-db.js';
import * as projectChanges from '$lib/server/project-changes.js';
import { getProjectPathById } from '$lib/server/project.js';
import { logger } from '$lib/server/logger.js';

// ── Stream Definitions ────────────────────────────────────────────────────

interface StreamDef {
	id: string;
	name: string;
	unit: string;
	min: number;
	max: number;
}

const STREAMS: StreamDef[] = [
	{ id: 'plugin:temperature', name: 'Temperature', unit: '°C', min: 15, max: 95 },
	{ id: 'plugin:pressure', name: 'Pressure', unit: 'kPa', min: 95, max: 110 },
	{ id: 'plugin:voltage', name: 'Bus Voltage', unit: 'V', min: 10.5, max: 14.8 },
	{ id: 'plugin:fuel_level', name: 'Fuel Level', unit: '%', min: 0, max: 100 },
	{ id: 'plugin:signal', name: 'Signal Strength', unit: 'dBm', min: -100, max: -30 },
	{ id: 'plugin:gps', name: 'Vehicle GPS', unit: '°', min: -180, max: 180 }
];

// ── Deterministic Waveform Generators ─────────────────────────────────────

function temperature(t: number): number {
	// Slow sine with small high-freq noise
	return 42 + 18 * Math.sin(t / 30) + 3 * Math.sin(t / 3.7) + (Math.random() - 0.5) * 1.5;
}

function pressure(t: number): number {
	return 101.3 + 4 * Math.sin(t / 45) + 2 * Math.cos(t / 12) + (Math.random() - 0.5) * 0.5;
}

function voltage(t: number): number {
	// Slow ramp with periodic dips
	const base = 12.6 + 0.8 * Math.sin(t / 60);
	const dip = Math.abs((t % 120) - 60) < 5 ? -1.2 : 0;
	return base + dip + (Math.random() - 0.5) * 0.15;
}

function fuelLevel(t: number): number {
	// Slowly decreasing with periodic refills every ~300s
	const cycle = t % 300;
	const level = 100 - (cycle / 300) * 45;
	return Math.max(0, Math.min(100, level + (Math.random() - 0.5) * 0.5));
}

function signalStrength(t: number): number {
	return -55 + 15 * Math.sin(t / 25) + 8 * Math.cos(t / 7) + (Math.random() - 0.5) * 5;
}

function gpsPoint(t: number): { lat: number; lon: number; alt: number; speed: number } {
	// Circular orbit around a reference point
	const centerLat = 28.5;
	const centerLon = -80.65;
	const radius = 0.5;
	const period = 180; // seconds per circle
	const angle = ((t % period) / period) * 2 * Math.PI;
	return {
		lat: centerLat + radius * Math.cos(angle) + (Math.random() - 0.5) * 0.002,
		lon: centerLon + radius * Math.sin(angle) + (Math.random() - 0.5) * 0.002,
		alt: 12000 + 2000 * Math.sin(t / 40) + (Math.random() - 0.5) * 50,
		speed: 250 + 30 * Math.sin(t / 20) + (Math.random() - 0.5) * 5
	};
}

// ── Object Scaffolding ───────────────────────────────────────────────────

/**
 * Creates a "Sample Telemetry" folder and a set of objects to visualise the
 * plugin streams. Only creates if the folder doesn't already exist.
 */
function scaffoldObjects(projectPath: string, rootId: string): void {
	const tree = objectsDb.getObjectTree(projectPath);
	if (!tree) return;

	// Check if folder already exists
	const existing = tree.children?.find((c) => c.name === 'Sample Telemetry');
	if (existing) return;

	// Create folder under root
	const folder = objectsDb.createObject(projectPath, {
		type: 'folder',
		parentId: rootId,
		name: 'Sample Telemetry',
		notes: 'Auto-created by the Sample Telemetry Plugin'
	});

	// Line plot: temperature + pressure
	objectsDb.createObject(projectPath, {
		type: 'line-plot',
		parentId: folder.id,
		name: 'Thermal & Pressure',
		props: {
			dataSources: ['plugin:temperature', 'plugin:pressure'],
			seriesNames: ['Temperature', 'Pressure'],
			colors: ['#f0883e', '#4f9cf9'],
			windowSec: 120
		}
	});

	// Gauge: voltage
	objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Bus Voltage',
		props: {
			dataSource: 'plugin:voltage',
			displayType: 'dial',
			min: 10,
			max: 15,
			unit: 'V',
			label: 'Bus Voltage',
			thresholdMin: 11,
			thresholdMax: 14.2,
			precision: 2
		}
	});

	// Gauge: fuel level (linear)
	objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Fuel Level',
		props: {
			dataSource: 'plugin:fuel_level',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			label: 'Fuel',
			thresholdMin: 20,
			arcColor: '#3fb950'
		}
	});

	// Map: GPS track
	objectsDb.createObject(projectPath, {
		type: 'map-view',
		parentId: folder.id,
		name: 'Vehicle Track',
		props: {
			gpsStreamId: 'plugin:gps',
			baseLayer: 'satellite',
			showGpsTrail: true,
			trailColor: '#d2a8ff',
			showInspector: true,
			zoom: 8
		}
	});

	// Line plot: signal strength
	objectsDb.createObject(projectPath, {
		type: 'line-plot',
		parentId: folder.id,
		name: 'Signal Strength',
		props: {
			dataSources: ['plugin:signal'],
			seriesNames: ['Signal (dBm)'],
			colors: ['#58a6ff'],
			windowSec: 120
		}
	});

	// Line plot: voltage over time
	objectsDb.createObject(projectPath, {
		type: 'line-plot',
		parentId: folder.id,
		name: 'Bus Voltage',
		props: {
			dataSources: ['plugin:voltage'],
			seriesNames: ['Voltage (V)'],
			colors: ['#ffa657'],
			windowSec: 120
		}
	});

	// Summary widget: system health
	objectsDb.createObject(projectPath, {
		type: 'summary-widget',
		parentId: folder.id,
		name: 'System Health',
		props: {
			okLabel: 'ALL SYSTEMS NOMINAL',
			okColor: '#238636',
			rules: [
				{
					streamId: 'plugin:temperature',
					op: 'gt',
					threshold: 80,
					label: 'High temperature',
					message: 'THERMAL WARNING',
					color: '#d29922'
				},
				{
					streamId: 'plugin:voltage',
					op: 'lt',
					threshold: 11,
					label: 'Low voltage',
					message: 'POWER CRITICAL',
					color: '#f85149'
				}
			]
		}
	});

	// Telemetry table: all scalar streams
	objectsDb.createObject(projectPath, {
		type: 'telemetry-table',
		parentId: folder.id,
		name: 'Raw Telemetry',
		props: {
			columns: [
				{ streamId: 'plugin:temperature', label: 'Temp (°C)' },
				{ streamId: 'plugin:pressure', label: 'Press (kPa)' },
				{ streamId: 'plugin:voltage', label: 'Volts (V)' },
				{ streamId: 'plugin:fuel_level', label: 'Fuel (%)' },
				{ streamId: 'plugin:signal', label: 'Signal (dBm)' }
			],
			maxRows: 200,
			pollMs: 1000
		}
	});

	logger.info('sample-telemetry-plugin', 'Scaffolded Sample Telemetry objects', {
		folderId: folder.id
	});
}

// ── Plugin Registration ──────────────────────────────────────────────────

export function registerSampleTelemetryPlugin(): void {
	registerInProcess({
		id: 'sample-telemetry',
		name: 'Sample Telemetry',
		type: 'in-process',
		version: '1.0.0',
		description:
			'Generates realistic simulated telemetry (temperature, pressure, voltage, fuel, signal, GPS) at 1 Hz through the real ingest pipeline.',
		capabilities: ['streams', 'objects'],
		streams: STREAMS.map((s) => ({
			id: s.id,
			name: s.name,
			metadata: { unit: s.unit, min: s.min, max: s.max }
		})),

		run(ctx: InProcessPluginContext) {
			const projectPath = getProjectPathById(ctx.projectId);
			if (!projectPath) {
				logger.warn('sample-telemetry-plugin', 'Project not found — cannot start plugin', {
					projectId: ctx.projectId
				});
				return;
			}

			// Declare streams so they appear in the streams list immediately
			for (const s of STREAMS) {
				streamsDb.ensureStream(projectPath, s.id, s.name);
				streamsDb.updateStreamMetadata(projectPath, s.id, {
					unit: s.unit,
					min: s.min,
					max: s.max,
					source: 'sample-telemetry-plugin'
				});
			}

			// Scaffold objects (idempotent)
			const tree = objectsDb.getObjectTree(projectPath);
			if (tree) {
				scaffoldObjects(projectPath, tree.id);
				// In-process scaffolding bypasses the API layer, so emit a change event for the UI Explorer.
				projectChanges.notify(ctx.projectId, { type: 'tree-changed' });
			}

			logger.info('sample-telemetry-plugin', 'Started — ingesting at 1 Hz', {
				projectId: ctx.projectId,
				streams: STREAMS.map((s) => s.id)
			});

			// 1 Hz ingest loop
			const startEpoch = Date.now() / 1000;
			const timer = setInterval(() => {
				const t = Date.now() / 1000 - startEpoch;
				try {
					ctx.ingest('plugin:temperature', { value: temperature(t) });
					ctx.ingest('plugin:pressure', { value: pressure(t) });
					ctx.ingest('plugin:voltage', { value: voltage(t) });
					ctx.ingest('plugin:fuel_level', { value: fuelLevel(t) });
					ctx.ingest('plugin:signal', { value: signalStrength(t) });
					ctx.ingest('plugin:gps', gpsPoint(t));
				} catch (e) {
					logger.exception('sample-telemetry-plugin', 'Ingest error', e);
				}
			}, 1000);

			ctx.onStop = () => {
				clearInterval(timer);
				logger.info('sample-telemetry-plugin', 'Stopped');
			};
		}
	});
}
