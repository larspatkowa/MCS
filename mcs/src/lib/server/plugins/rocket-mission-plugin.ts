/**
 * rocket-mission-plugin.ts
 *
 * Multi-stage rocket mission simulation feeding realistic telemetry through the
 * MCS ingest pipeline. The mission repeats on a 600-second (10-minute) cycle:
 *
 *     0–30s     Pre-launch (systems check, countdown)
 *    30–90s     Stage 1 burn (main engines)
 *    90–100s    Stage separation
 *   100–200s    Stage 2 burn (upper stage)
 *   200–215s    Fairing separation
 *   215–400s    Coast phase (unpowered ascent)
 *   400–500s    Orbit insertion burn
 *   500–600s    On-orbit (stable orbit)
 *
 * Streams cover: altitude, velocity, acceleration, chamber pressure per stage,
 * fuel mass per stage, dynamic pressure (max-q), GPS position, downrange distance,
 * a stage indicator, and a mission-elapsed-time counter.
 */

import { registerInProcess, type InProcessPluginContext } from '$lib/server/plugin-registry.js';
import * as streamsDb from '$lib/server/streams-db.js';
import * as objectsDb from '$lib/server/objects-db.js';
import * as projectChanges from '$lib/server/project-changes.js';
import { getProjectPathById } from '$lib/server/project.js';
import { logger } from '$lib/server/logger.js';

// ── Stream definitions ───────────────────────────────────────────────────

interface StreamDef {
	id: string;
	name: string;
	unit: string;
	min: number;
	max: number;
}

const STREAMS: StreamDef[] = [
	{ id: 'rocket:altitude', name: 'Altitude', unit: 'km', min: 0, max: 400 },
	{ id: 'rocket:velocity', name: 'Velocity', unit: 'm/s', min: 0, max: 8000 },
	{ id: 'rocket:accel', name: 'Acceleration', unit: 'g', min: -1, max: 6 },
	{ id: 'rocket:chamber1', name: 'Stage 1 Chamber', unit: 'MPa', min: 0, max: 25 },
	{ id: 'rocket:chamber2', name: 'Stage 2 Chamber', unit: 'MPa', min: 0, max: 12 },
	{ id: 'rocket:fuel1', name: 'Stage 1 Fuel', unit: '%', min: 0, max: 100 },
	{ id: 'rocket:fuel2', name: 'Stage 2 Fuel', unit: '%', min: 0, max: 100 },
	{ id: 'rocket:maxq', name: 'Dynamic Pressure', unit: 'kPa', min: 0, max: 40 },
	{ id: 'rocket:gps', name: 'Vehicle GPS', unit: '°', min: -180, max: 180 },
	{ id: 'rocket:downrange', name: 'Downrange', unit: 'km', min: 0, max: 25000 },
	{ id: 'rocket:stage', name: 'Mission Stage', unit: '', min: 0, max: 7 },
	{ id: 'rocket:met', name: 'Mission Elapsed Time', unit: 's', min: 0, max: 600 },
	{ id: 'rocket:temp_ext', name: 'External Temp', unit: '°C', min: -180, max: 600 },
	{ id: 'rocket:temp_engine', name: 'Engine Temp', unit: '°C', min: 0, max: 3500 }
];

// ── Flight phases ────────────────────────────────────────────────────────

const CYCLE = 600; // 10-minute repeating mission

const enum Phase {
	Prelaunch = 0,
	Stage1Burn = 1,
	Separation1 = 2,
	Stage2Burn = 3,
	FairingSep = 4,
	Coast = 5,
	OrbitInsertion = 6,
	OnOrbit = 7
}

function getPhase(met: number): Phase {
	if (met < 30) return Phase.Prelaunch;
	if (met < 90) return Phase.Stage1Burn;
	if (met < 100) return Phase.Separation1;
	if (met < 200) return Phase.Stage2Burn;
	if (met < 215) return Phase.FairingSep;
	if (met < 400) return Phase.Coast;
	if (met < 500) return Phase.OrbitInsertion;
	return Phase.OnOrbit;
}

function noise(scale: number): number {
	return (Math.random() - 0.5) * 2 * scale;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * clamp(t, 0, 1);
}

// ── Telemetry generator ──────────────────────────────────────────────────

function generateTelemetry(met: number) {
	const phase = getPhase(met);

	// — Altitude (km) — piecewise trajectory
	let altitude = 0;
	if (met < 30) {
		altitude = 0;
	} else if (met < 90) {
		// Stage 1: 0→80 km, quadratic
		const t = (met - 30) / 60;
		altitude = 80 * t * t;
	} else if (met < 100) {
		// Sep: coast through 80-90 km
		altitude = 80 + (met - 90) * 1;
	} else if (met < 200) {
		// Stage 2: 90→200 km
		const t = (met - 100) / 100;
		altitude = 90 + 110 * t;
	} else if (met < 400) {
		// Coast: 200→350 km
		const t = (met - 200) / 200;
		altitude = 200 + 150 * (1 - Math.pow(1 - t, 2));
	} else if (met < 500) {
		// Orbit insertion: 350→400 km
		const t = (met - 400) / 100;
		altitude = 350 + 50 * t;
	} else {
		// On orbit: ~400 km
		altitude = 400 + noise(0.5);
	}
	altitude = Math.max(0, altitude + noise(0.2));

	// — Velocity (m/s) —
	let velocity = 0;
	if (met < 30) {
		velocity = 0;
	} else if (met < 90) {
		// Stage 1: 0→2400 m/s
		const t = (met - 30) / 60;
		velocity = 2400 * t;
	} else if (met < 100) {
		// Sep: coasting, slight decay
		velocity = 2400 - (met - 90) * 5;
	} else if (met < 200) {
		// Stage 2: 2350→5600 m/s
		const t = (met - 100) / 100;
		velocity = 2350 + 3250 * t;
	} else if (met < 400) {
		// Coast: slight gain from gravity turn
		const t = (met - 200) / 200;
		velocity = 5600 + 1200 * t;
	} else if (met < 500) {
		// Orbit insertion: 6800→7800 m/s
		const t = (met - 400) / 100;
		velocity = 6800 + 1000 * t;
	} else {
		velocity = 7800 + noise(5);
	}
	velocity = Math.max(0, velocity + noise(3));

	// — Acceleration (g) —
	let accel = 0;
	if (phase === Phase.Prelaunch) accel = 0;
	else if (phase === Phase.Stage1Burn) accel = lerp(1.2, 3.8, (met - 30) / 60) + noise(0.15);
	else if (phase === Phase.Separation1) accel = noise(0.3);
	else if (phase === Phase.Stage2Burn) accel = lerp(0.8, 4.5, (met - 100) / 100) + noise(0.1);
	else if (phase === Phase.FairingSep) accel = noise(0.2);
	else if (phase === Phase.Coast) accel = noise(0.01);
	else if (phase === Phase.OrbitInsertion) accel = lerp(0.3, 1.5, (met - 400) / 100) + noise(0.08);
	else accel = noise(0.005); // microgravity

	// — Chamber pressure Stage 1 (MPa) —
	let chamber1 = 0;
	if (phase === Phase.Stage1Burn) {
		chamber1 = lerp(18, 22, (met - 30) / 60) + noise(0.3);
	}

	// — Chamber pressure Stage 2 (MPa) —
	let chamber2 = 0;
	if (phase === Phase.Stage2Burn) {
		chamber2 = lerp(8, 10, (met - 100) / 100) + noise(0.2);
	} else if (phase === Phase.OrbitInsertion) {
		chamber2 = lerp(6, 9, (met - 400) / 100) + noise(0.15);
	}

	// — Fuel levels (%) —
	let fuel1 = 100;
	if (met >= 30 && met < 90) {
		fuel1 = lerp(100, 2, (met - 30) / 60);
	} else if (met >= 90) {
		fuel1 = 0;
	}

	let fuel2 = 100;
	if (met >= 100 && met < 200) {
		fuel2 = lerp(100, 30, (met - 100) / 100);
	} else if (met >= 200 && met < 500) {
		// Coast: stays at 30, then burns during orbit insertion
		if (met >= 400) {
			fuel2 = lerp(30, 5, (met - 400) / 100);
		} else {
			fuel2 = 30;
		}
	} else if (met >= 500) {
		fuel2 = 5 + noise(0.1);
	}

	// — Dynamic pressure / Max-Q (kPa) —
	let maxq = 0;
	if (met >= 30 && met < 90) {
		// Peaks around 35 kPa at ~50s into flight, then drops
		const t = (met - 30) / 60;
		maxq = 35 * Math.sin(t * Math.PI) * Math.exp(-0.5 * t) + noise(0.5);
	}
	maxq = Math.max(0, maxq);

	// — GPS position (orbit ground track) —
	const launchLat = 28.5729;
	const launchLon = -80.649;
	let lat = launchLat;
	let lon = launchLon;
	if (met >= 30) {
		// Fly northeast, then orbit ground track
		const flightTime = met - 30;
		const incRad = (51.6 * Math.PI) / 180;
		const orbPeriod = 5400; // ~90 min
		const angularPos = (flightTime / orbPeriod) * 2 * Math.PI;
		lat = launchLat + Math.sin(angularPos) * (180 / Math.PI) * Math.sin(incRad);
		lon = launchLon + (flightTime / orbPeriod) * 360;
		// Wrap longitude
		lon = ((lon + 180) % 360) - 180;
	}
	lat += noise(0.001);
	lon += noise(0.001);

	// — Downrange distance (km) —
	let downrange = 0;
	if (met >= 30) {
		const flightTime = met - 30;
		// Rough: velocity * time integrated
		if (met < 90) downrange = (0.5 * 2400 * ((met - 30) / 60) * (met - 30)) / 1000;
		else {
			const s1dist = (0.5 * 2400 * 60) / 1000; // ~72 km
			downrange = s1dist + (velocity * (flightTime - 60)) / 1000;
		}
	}

	// — External temperature (°C) —
	let tempExt = 20;
	if (met >= 30 && met < 90) {
		// Heats up through atmosphere, peaks at max-q
		const t = (met - 30) / 60;
		tempExt = 20 + 500 * Math.sin(t * Math.PI) * Math.exp(-0.3 * t);
	} else if (met >= 90 && met < 300) {
		// Cools rapidly in space
		tempExt = lerp(200, -100, (met - 90) / 210);
	} else if (met >= 300) {
		tempExt = -100 + noise(5);
	}

	// — Engine temperature (°C) —
	let tempEngine = 20;
	if (phase === Phase.Stage1Burn) {
		tempEngine = lerp(800, 3200, (met - 30) / 60) + noise(20);
	} else if (phase === Phase.Stage2Burn) {
		tempEngine = lerp(600, 2800, (met - 100) / 100) + noise(15);
	} else if (phase === Phase.OrbitInsertion) {
		tempEngine = lerp(500, 2200, (met - 400) / 100) + noise(10);
	} else {
		tempEngine = Math.max(20, tempEngine - 5);
	}

	return {
		altitude,
		velocity,
		accel,
		chamber1,
		chamber2,
		fuel1,
		fuel2,
		maxq,
		lat,
		lon,
		alt: altitude * 1000, // meters for GPS
		downrange,
		stage: phase as number,
		met,
		tempExt,
		tempEngine
	};
}

// ── Object scaffolding ──────────────────────────────────────────────────

function scaffoldRocketDemo(projectPath: string, rootId: string): void {
	const tree = objectsDb.getObjectTree(projectPath);
	if (!tree) return;

	// Check if folder already exists
	const existing = tree.children?.find((c) => c.name === 'Rocket Mission');
	if (existing) return;

	const folder = objectsDb.createObject(projectPath, {
		type: 'folder',
		parentId: rootId,
		name: 'Rocket Mission',
		notes: 'Multi-stage rocket mission demo — auto-created by the Rocket Mission Plugin'
	});

	// -- Line plot: altitude + velocity
	const altPlot = objectsDb.createObject(projectPath, {
		type: 'line-plot',
		parentId: folder.id,
		name: 'Altitude & Velocity',
		props: {
			dataSources: ['rocket:altitude', 'rocket:velocity'],
			seriesNames: ['Altitude (km)', 'Velocity (m/s)'],
			pollInterval: 1000,
			xAxis: { label: 'Time' },
			yAxis: { label: 'Value' }
		}
	});

	// -- Gauge: acceleration
	const accelGauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'G-Force',
		props: {
			dataSource: 'rocket:accel',
			displayType: 'dial',
			min: -1,
			max: 6,
			unit: 'g',
			label: 'Acceleration',
			thresholdMax: 4.5,
			warningMax: 3.5,
			precision: 2
		}
	});

	// -- Gauge: Stage 1 chambers
	const ch1Gauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'S1 Chamber',
		props: {
			dataSource: 'rocket:chamber1',
			displayType: 'linear',
			min: 0,
			max: 25,
			unit: 'MPa',
			label: 'Stage 1 Chamber',
			thresholdMax: 23,
			precision: 1
		}
	});

	// -- Gauge: Stage 2 chambers
	const ch2Gauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'S2 Chamber',
		props: {
			dataSource: 'rocket:chamber2',
			displayType: 'linear',
			min: 0,
			max: 12,
			unit: 'MPa',
			label: 'Stage 2 Chamber',
			thresholdMax: 11,
			precision: 1
		}
	});

	// -- Gauge: Fuel 1
	const fuel1Gauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'S1 Fuel',
		props: {
			dataSource: 'rocket:fuel1',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			label: 'S1 Propellant',
			thresholdMin: 10,
			precision: 0,
			normalColor: '#3fb950'
		}
	});

	// -- Gauge: Fuel 2
	const fuel2Gauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'S2 Fuel',
		props: {
			dataSource: 'rocket:fuel2',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			label: 'S2 Propellant',
			thresholdMin: 10,
			precision: 0,
			normalColor: '#3fb950'
		}
	});

	// -- Gauge: dynamic pressure
	const maxqGauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Max-Q',
		props: {
			dataSource: 'rocket:maxq',
			displayType: 'dial',
			min: 0,
			max: 40,
			unit: 'kPa',
			label: 'Dynamic Pressure',
			thresholdMax: 35,
			precision: 1
		}
	});

	// -- Map: ground track
	const mapObj = objectsDb.createObject(projectPath, {
		type: 'map-view',
		parentId: folder.id,
		name: 'Ground Track',
		props: {
			gpsStreamId: 'rocket:gps',
			baseLayer: 'satellite',
			showGpsTrail: true,
			trailWindowSec: 600,
			trailMaxPoints: 600,
			trailColor: '#4f9cf9',
			autoFollow: true,
			showMarker: true,
			showInspector: true,
			zoom: 4,
			centerLat: 28.57,
			centerLon: -80.65
		}
	});

	// -- Orbital view
	const orbitalObj = objectsDb.createObject(projectPath, {
		type: 'orbital-view',
		parentId: folder.id,
		name: 'Orbital Track',
		props: {
			gpsStreamId: 'rocket:gps',
			showTrail: true,
			trailColor: '#4f9cf9',
			showGrid: true,
			showOrbitPath: true,
			inclination: 51.6,
			period: 5400,
			trailPoints: 600
		}
	});

	// -- Mission clock
	const missionClock = objectsDb.createObject(projectPath, {
		type: 'clock',
		parentId: folder.id,
		name: 'Mission Clock',
		props: {
			timezone: 'UTC',
			showDate: false,
			use12h: false,
			displayMode: 'digital'
		}
	});

	// -- Summary widget: flight status
	const statusWidget = objectsDb.createObject(projectPath, {
		type: 'summary-widget',
		parentId: folder.id,
		name: 'Flight Status',
		props: {
			okLabel: 'Nominal',
			okColor: '#238636',
			rules: [
				{
					streamId: 'rocket:accel',
					op: 'gt',
					threshold: 4.5,
					label: 'High G-Load',
					color: '#f85149'
				},
				{
					streamId: 'rocket:maxq',
					op: 'gt',
					threshold: 33,
					label: 'Max-Q Warning',
					color: '#d29922'
				},
				{
					streamId: 'rocket:fuel1',
					op: 'lt',
					threshold: 5,
					label: 'S1 Fuel Critical',
					color: '#f85149'
				},
				{
					streamId: 'rocket:temp_engine',
					op: 'gt',
					threshold: 3000,
					label: 'Engine Overheat',
					color: '#f85149'
				}
			]
		}
	});

	// -- Telemetry table
	const telTable = objectsDb.createObject(projectPath, {
		type: 'telemetry-table',
		parentId: folder.id,
		name: 'Mission Telemetry',
		props: {
			columns: [
				{ streamId: 'rocket:altitude', label: 'Alt (km)', field: 'value' },
				{ streamId: 'rocket:velocity', label: 'Vel (m/s)', field: 'value' },
				{ streamId: 'rocket:accel', label: 'Accel (g)', field: 'value' },
				{ streamId: 'rocket:fuel1', label: 'S1 Fuel (%)', field: 'value' },
				{ streamId: 'rocket:fuel2', label: 'S2 Fuel (%)', field: 'value' },
				{ streamId: 'rocket:downrange', label: 'Downrange (km)', field: 'value' }
			],
			rowLimit: 300
		}
	});

	// -- Gantt chart: mission timeline
	// Tasks are placed relative to the current wall time so the "now" cursor
	// falls in the middle of the pre-launch phase on first render.
	const missionEpoch = Math.floor(Date.now() / 1000); // T-0 reference
	const gantt = objectsDb.createObject(projectPath, {
		type: 'gantt-chart',
		parentId: folder.id,
		name: 'Mission Timeline',
		props: {
			showNow: true,
			windowSec: 720,
			rowHeight: 28,
			labelWidth: 130,
			tasks: [
				{
					id: 't1',
					label: 'Pre-launch',
					start: missionEpoch + 0,
					end: missionEpoch + 30,
					color: '#6e7681',
					progress: 100
				},
				{
					id: 't2',
					label: 'Stage 1 Burn',
					start: missionEpoch + 30,
					end: missionEpoch + 90,
					color: '#f0883e',
					progress: 0
				},
				{
					id: 't3',
					label: 'Separation',
					start: missionEpoch + 90,
					end: missionEpoch + 100,
					color: '#d2a8ff',
					progress: 0
				},
				{
					id: 't4',
					label: 'Stage 2 Burn',
					start: missionEpoch + 100,
					end: missionEpoch + 200,
					color: '#58a6ff',
					progress: 0
				},
				{
					id: 't5',
					label: 'Fairing Sep',
					start: missionEpoch + 200,
					end: missionEpoch + 215,
					color: '#d2a8ff',
					progress: 0
				},
				{
					id: 't6',
					label: 'Coast',
					start: missionEpoch + 215,
					end: missionEpoch + 400,
					color: '#3fb950',
					progress: 0
				},
				{
					id: 't7',
					label: 'Orbit Insertion',
					start: missionEpoch + 400,
					end: missionEpoch + 500,
					color: '#f97316',
					progress: 0
				},
				{
					id: 't8',
					label: 'On-Orbit',
					start: missionEpoch + 500,
					end: missionEpoch + 600,
					color: '#238636',
					progress: 0
				}
			]
		}
	});

	// -- Condition set for stage monitoring
	const condSet = objectsDb.createObject(projectPath, {
		type: 'condition-set',
		parentId: folder.id,
		name: 'Stage Conditions',
		props: {
			mode: 'table',
			label: 'Stage Monitor',
			conditions: [
				{
					id: 'c1',
					streamId: 'rocket:chamber1',
					op: 'gt',
					value: 0.5,
					label: 'S1 Engines Active',
					outputTrue: 'FIRING',
					outputFalse: 'OFF',
					colorTrue: '#f0883e',
					colorFalse: '#484f58'
				},
				{
					id: 'c2',
					streamId: 'rocket:chamber2',
					op: 'gt',
					value: 0.5,
					label: 'S2 Engine Active',
					outputTrue: 'FIRING',
					outputFalse: 'OFF',
					colorTrue: '#58a6ff',
					colorFalse: '#484f58'
				},
				{
					id: 'c3',
					streamId: 'rocket:fuel1',
					op: 'lt',
					value: 5,
					label: 'S1 Fuel Depleted',
					outputTrue: 'YES',
					outputFalse: 'NO',
					colorTrue: '#f85149',
					colorFalse: '#3fb950'
				},
				{
					id: 'c4',
					streamId: 'rocket:accel',
					op: 'gt',
					value: 4,
					label: 'High G-Load',
					outputTrue: 'WARNING',
					outputFalse: 'OK',
					colorTrue: '#d29922',
					colorFalse: '#3fb950'
				}
			]
		}
	});

	// -- Notebook for mission log (timestamps in unix seconds)
	const nowSec = Math.floor(Date.now() / 1000);
	const notebook = objectsDb.createObject(projectPath, {
		type: 'notebook',
		parentId: folder.id,
		name: 'Mission Log',
		props: {
			entries: [
				{
					id: 'e1',
					text: 'Vehicle on internal power. All systems go for launch.',
					timestamp: nowSec - 600,
					author: 'Flight Director'
				},
				{
					id: 'e2',
					text: 'T-10 countdown initiated. Weather is green.',
					timestamp: nowSec - 300,
					author: 'Launch Controller'
				},
				{
					id: 'e3',
					text: 'Engine ignition sequence started.',
					timestamp: nowSec - 30,
					author: 'Propulsion'
				}
			],
			showTags: true,
			showAuthor: true,
			newestFirst: true
		}
	});

	// -- Line plot: temperatures
	const tempPlot = objectsDb.createObject(projectPath, {
		type: 'line-plot',
		parentId: folder.id,
		name: 'Temperatures',
		props: {
			dataSources: ['rocket:temp_ext', 'rocket:temp_engine'],
			seriesNames: ['External', 'Engine'],
			pollInterval: 1000,
			xAxis: { label: 'Time' },
			yAxis: { label: '°C' }
		}
	});

	// -- Markdown note: mission brief
	const brief = objectsDb.createObject(projectPath, {
		type: 'markdown-note',
		parentId: folder.id,
		name: 'Mission Brief',
		props: {
			content: [
				'## Orbital Launch Vehicle — Flight Demo',
				'',
				'**Objective:** Deliver payload to 400 km LEO (51.6° inclination)',
				'',
				'### Flight Profile',
				'| Phase | Duration | Key Event |',
				'|-------|----------|-----------|',
				'| Pre-launch | 30s | Systems check |',
				'| Stage 1 | 60s | Main engine burn |',
				'| Separation | 10s | Stage sep + coast |',
				'| Stage 2 | 100s | Upper stage burn |',
				'| Fairing Sep | 15s | Payload exposed |',
				'| Coast | 185s | Unpowered ascent |',
				'| Orbit Insert | 100s | Circularization |',
				'| On-Orbit | 100s | Payload deploy |',
				'',
				'### Abort Criteria',
				'- Chamber pressure deviation > ±15%',
				'- G-load exceeds 5g',
				'- Vehicle attitude error > 3°'
			].join('\n')
		}
	});

	// ── Build the flex-layout dashboard ──────────────────────────────────

	function uid() {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	}

	// Create the main dashboard as a flex-layout
	objectsDb.createObject(projectPath, {
		type: 'flex-layout',
		parentId: folder.id,
		name: 'Mission layout',
		props: {
			root: {
				id: uid(),
				type: 'split',
				direction: 'horizontal',
				ratio: 0.65,
				children: [
					// Left: main content (vertical split)
					{
						id: uid(),
						type: 'split',
						direction: 'vertical',
						ratio: 0.6,
						children: [
							// Top: altitude/velocity plot
							{
								id: uid(),
								type: 'split',
								direction: 'horizontal',
								ratio: 0.7,
								children: [
									{ id: uid(), type: 'leaf', objectId: altPlot.id },
									// Gauges column
									{
										id: uid(),
										type: 'split',
										direction: 'vertical',
										ratio: 0.5,
										children: [
											{ id: uid(), type: 'leaf', objectId: accelGauge.id },
											{ id: uid(), type: 'leaf', objectId: maxqGauge.id }
										]
									}
								]
							},
							// Bottom: split between map and orbital
							{
								id: uid(),
								type: 'split',
								direction: 'horizontal',
								ratio: 0.5,
								children: [
									{ id: uid(), type: 'leaf', objectId: mapObj.id },
									{ id: uid(), type: 'leaf', objectId: orbitalObj.id }
								]
							}
						]
					},
					// Right sidebar
					{
						id: uid(),
						type: 'split',
						direction: 'vertical',
						ratio: 0.3,
						children: [
							// Status + fuel gauges
							{
								id: uid(),
								type: 'split',
								direction: 'vertical',
								ratio: 0.4,
								children: [
									{ id: uid(), type: 'leaf', objectId: statusWidget.id },
									{
										id: uid(),
										type: 'split',
										direction: 'horizontal',
										ratio: 0.5,
										children: [
											// Stage 1 fuel — with visibility rule (hide after stage 1 burnout)
											{
												id: uid(),
												type: 'leaf',
												objectId: fuel1Gauge.id,
												visibilityRules: [{ streamId: 'rocket:fuel1', op: 'gt', value: 0.1 }]
											},
											{ id: uid(), type: 'leaf', objectId: fuel2Gauge.id }
										]
									}
								]
							},
							// Gantt + telemetry table
							{
								id: uid(),
								type: 'split',
								direction: 'vertical',
								ratio: 0.4,
								children: [
									{ id: uid(), type: 'leaf', objectId: gantt.id },
									{ id: uid(), type: 'leaf', objectId: telTable.id }
								]
							}
						]
					}
				]
			}
		}
	});

	logger.info('rocket-mission-plugin', 'Scaffolded Rocket Mission objects', {
		folderId: folder.id
	});
}

// ── Plugin Registration ──────────────────────────────────────────────────

export function registerRocketMissionPlugin(): void {
	registerInProcess({
		id: 'rocket-mission',
		name: 'Rocket Mission',
		type: 'in-process',
		version: '1.0.0',
		description:
			'Multi-stage rocket mission simulation with altitude, velocity, acceleration, chamber pressure, fuel levels, GPS, and thermal telemetry at 1 Hz.',
		capabilities: ['streams', 'objects'],
		streams: STREAMS.map((s) => ({
			id: s.id,
			name: s.name,
			metadata: { unit: s.unit, min: s.min, max: s.max }
		})),

		run(ctx: InProcessPluginContext) {
			const projectPath = getProjectPathById(ctx.projectId);
			if (!projectPath) {
				logger.warn('rocket-mission-plugin', 'Project not found — cannot start plugin', {
					projectId: ctx.projectId
				});
				return;
			}

			// Declare streams
			for (const s of STREAMS) {
				streamsDb.ensureStream(projectPath, s.id, s.name);
				streamsDb.updateStreamMetadata(projectPath, s.id, {
					unit: s.unit,
					min: s.min,
					max: s.max,
					source: 'rocket-mission-plugin'
				});
			}

			// Scaffold objects (idempotent)
			const tree = objectsDb.getObjectTree(projectPath);
			if (tree) {
				scaffoldRocketDemo(projectPath, tree.id);
				// In-process scaffolding bypasses the API layer, so emit a change event for the UI Explorer.
				projectChanges.notify(ctx.projectId, { type: 'tree-changed' });
			}

			logger.info('rocket-mission-plugin', 'Started — ingesting at 1 Hz', {
				projectId: ctx.projectId,
				streams: STREAMS.map((s) => s.id)
			});

			// 1 Hz ingest loop
			const startEpoch = Date.now() / 1000;
			const timer = setInterval(() => {
				const elapsed = Date.now() / 1000 - startEpoch;
				const met = elapsed % CYCLE;
				try {
					const t = generateTelemetry(met);
					ctx.ingest('rocket:altitude', { value: t.altitude });
					ctx.ingest('rocket:velocity', { value: t.velocity });
					ctx.ingest('rocket:accel', { value: t.accel });
					ctx.ingest('rocket:chamber1', { value: t.chamber1 });
					ctx.ingest('rocket:chamber2', { value: t.chamber2 });
					ctx.ingest('rocket:fuel1', { value: t.fuel1 });
					ctx.ingest('rocket:fuel2', { value: t.fuel2 });
					ctx.ingest('rocket:maxq', { value: t.maxq });
					ctx.ingest('rocket:gps', { lat: t.lat, lon: t.lon, alt: t.alt, speed: t.velocity });
					ctx.ingest('rocket:downrange', { value: t.downrange });
					ctx.ingest('rocket:stage', { value: t.stage });
					ctx.ingest('rocket:met', { value: t.met });
					ctx.ingest('rocket:temp_ext', { value: t.tempExt });
					ctx.ingest('rocket:temp_engine', { value: t.tempEngine });
				} catch (e) {
					logger.exception('rocket-mission-plugin', 'Ingest error', e);
				}
			}, 1000);

			ctx.onStop = () => {
				clearInterval(timer);
				logger.info('rocket-mission-plugin', 'Stopped');
			};
		}
	});
}
