import { registerInProcess, type InProcessPluginContext } from '$lib/server/plugin-registry.js';
import * as streamsDb from '$lib/server/streams-db.js';
import * as objectsDb from '$lib/server/objects-db.js';
import * as projectChanges from '$lib/server/project-changes.js';
import { getProjectPathById } from '$lib/server/project.js';
import { logger } from '$lib/server/logger.js';
import type { MapWaypoint } from '$lib/objects/types.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface StreamDef {
	id: string;
	name: string;
	unit: string;
	min: number;
	max: number;
}

interface SurveyWaypoint extends MapWaypoint {
	x: number;
	y: number;
	phase: MissionPhase;
}

interface StressZone {
	x: number;
	y: number;
	rx: number;
	ry: number;
	depth: number;
	label: string;
	prescription: string;
}

const TAG = 'agri-ndvi-mission-plugin';
// Mission loop length. Longer cycle = slower apparent ground speed for the same path.
const CYCLE_SEC = 900;
const GPS_INTERVAL_MS = 250;
// Emit key metrics frequently enough to feel realtime.
// GPS is 4 Hz; metrics at 2 Hz keeps UI responsive without excessive churn.
const METRIC_INTERVAL_TICKS = 2;
const EARTH_RADIUS_M = 6371000;

/**
 * NDVI demo bbox.
 *
 * NOTE: The demo NDVI overlay is a raster computed from Sentinel-2 (10m) COGs and
 * written under `mcs/static/assets/agri/` by `mcs/scripts/fetch-s2-ndvi.mjs`.
 *
 * User-provided bbox:
 * - top-left:     (41.993814, -93.678317)
 * - bottom-right: (41.979554, -93.658764)
 */
const FIELD = {
	name: 'Field bbox — central Iowa',
	south: 41.979554,
	west: -93.678317,
	north: 41.993814,
	east: -93.658764
} as const;

const STREAMS: StreamDef[] = [
	{ id: 'agri:field_ndvi', name: 'Field Mean NDVI', unit: 'NDVI', min: 0, max: 1 },
	{ id: 'agri:target_ndvi', name: 'Current Pass NDVI', unit: 'NDVI', min: 0, max: 1 },
	{ id: 'agri:stress_pct', name: 'Low-Vigor Area', unit: '%', min: 0, max: 100 },
	{ id: 'agri:canopy_temp', name: 'Canopy Temperature', unit: '°C', min: 10, max: 50 },
	{ id: 'agri:soil_moisture', name: 'Soil Moisture Proxy', unit: '%', min: 0, max: 100 },
	{ id: 'agri:battery_pct', name: 'Battery Reserve', unit: '%', min: 0, max: 100 },
	{ id: 'agri:coverage_pct', name: 'Coverage Complete', unit: '%', min: 0, max: 100 },
	{ id: 'agri:wind_mps', name: 'Wind Speed', unit: 'm/s', min: 0, max: 20 },
	{ id: 'agri:eta_min', name: 'Mission ETA', unit: 'min', min: 0, max: CYCLE_SEC / 60 },
	{ id: 'agri:waypoint_index', name: 'Waypoint Index', unit: '', min: 1, max: 12 },
	{ id: 'agri:mission_phase', name: 'Mission Phase', unit: '', min: 0, max: 3 },
	{ id: 'agri:gps', name: 'Survey Drone GPS', unit: '°', min: -180, max: 180 }
];

const STRESS_ZONES: StressZone[] = [
	{
		x: 0.69,
		y: 0.36,
		rx: 0.12,
		ry: 0.1,
		depth: 0.26,
		label: 'Zone A',
		prescription: 'Likely nitrogen limitation on upper terrace'
	},
	{
		x: 0.34,
		y: 0.72,
		rx: 0.14,
		ry: 0.12,
		depth: 0.31,
		label: 'Zone B',
		prescription: 'Irrigation shadow near western span overlap'
	},
	{
		x: 0.81,
		y: 0.79,
		rx: 0.1,
		ry: 0.09,
		depth: 0.2,
		label: 'Zone C',
		prescription: 'Drainage / compaction signature near low corner'
	}
];

function findFieldOverlayMapId(projectPath: string): string | null {
	const tree = objectsDb.getObjectTree(projectPath);
	const folder = tree?.children?.find((c) => c.type === 'folder' && c.name === 'Agriculture demo');
	const map = folder?.children?.find((c) => c.type === 'map-view' && c.name === 'Field Overlay');
	return map?.id ?? null;
}

function clampMissionSpeed(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isFinite(n)) return 1;
	return clamp(n, 0.25, 3);
}

enum MissionPhase {
	Transit = 0,
	Sweep = 1,
	Inspect = 2,
	Return = 3
}

type LatLon = { lat: number; lon: number };

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * clamp(t, 0, 1);
}

function oscillate(
	elapsed: number,
	amplitude: number,
	primaryDivisor: number,
	secondaryDivisor: number,
	phase = 0
): number {
	return (
		Math.sin(elapsed / primaryDivisor + phase) * amplitude * 0.68 +
		Math.cos(elapsed / secondaryDivisor + phase * 1.7) * amplitude * 0.32
	);
}

function pointFromNormalized(x: number, y: number) {
	return {
		lat: lerp(FIELD.south, FIELD.north, y),
		lon: lerp(FIELD.west, FIELD.east, x)
	};
}

function makeWaypoint(
	x: number,
	y: number,
	label: string,
	detail: string,
	phase: MissionPhase,
	color = '#64748b',
	markerSize = 5
): SurveyWaypoint {
	return {
		...pointFromNormalized(x, y),
		x,
		y,
		label,
		detail,
		color,
		markerSize,
		phase
	};
}

const ROUTE: SurveyWaypoint[] = [
	makeWaypoint(
		-0.08,
		0.52,
		'Launch',
		'Nurse truck, RTK base, and battery swap point',
		MissionPhase.Transit,
		'#64748b',
		6
	),
	makeWaypoint(0.06, 0.18, 'Ingress', 'Enter field and lock first swath', MissionPhase.Transit),
	makeWaypoint(0.94, 0.18, 'WP-01', 'North canopy sweep', MissionPhase.Sweep),
	makeWaypoint(0.94, 0.34, 'Turn-1', 'Turn south into second swath', MissionPhase.Sweep),
	makeWaypoint(0.08, 0.34, 'WP-02', 'Second swath return pass', MissionPhase.Sweep),
	makeWaypoint(0.08, 0.5, 'Turn-2', 'Turn south into third swath', MissionPhase.Sweep),
	makeWaypoint(0.95, 0.5, 'WP-03', 'Third swath return pass', MissionPhase.Sweep),
	makeWaypoint(0.69, 0.36, 'Zone A', 'Low-vigor terrace strip', MissionPhase.Inspect, '#475569', 6),
	makeWaypoint(
		0.34,
		0.72,
		'Zone B',
		'Moisture shadow inspection pass',
		MissionPhase.Inspect,
		'#475569',
		6
	),
	makeWaypoint(
		0.81,
		0.79,
		'Zone C',
		'Drainage anomaly confirmation',
		MissionPhase.Inspect,
		'#475569',
		6
	),
	makeWaypoint(
		0.12,
		0.9,
		'Egress',
		'Leave plot and climb to transit altitude',
		MissionPhase.Return
	),
	makeWaypoint(
		-0.08,
		0.52,
		'RTB',
		'Return to launch for scouting handoff',
		MissionPhase.Return,
		'#64748b',
		6
	)
];

const SEGMENT_DURATIONS = [32, 50, 18, 48, 18, 50, 44, 54, 46, 38, 30];

function pathDistanceMeters(path: Array<{ lat: number; lon: number }>): number {
	let sum = 0;
	for (let i = 1; i < path.length; i += 1) {
		sum += approxDistanceMeters(path[i - 1], path[i]);
	}
	return sum;
}

function positionAlongPath(
	path: Array<{ lat: number; lon: number }>,
	distanceM: number
): { lat: number; lon: number; segmentIndex: number; segmentT: number } {
	if (path.length === 0) return { lat: FIELD_CENTER.lat, lon: FIELD_CENTER.lon, segmentIndex: 0, segmentT: 0 };
	if (path.length === 1) return { lat: path[0].lat, lon: path[0].lon, segmentIndex: 0, segmentT: 0 };
	let remaining = Math.max(0, distanceM);
	for (let i = 1; i < path.length; i += 1) {
		const a = path[i - 1];
		const b = path[i];
		const seg = approxDistanceMeters(a, b);
		if (seg <= 0.0001) continue;
		if (remaining <= seg) {
			const t = remaining / seg;
			return {
				lat: lerp(a.lat, b.lat, t),
				lon: lerp(a.lon, b.lon, t),
				segmentIndex: i - 1,
				segmentT: t
			};
		}
		remaining -= seg;
	}
	const last = path[path.length - 1];
	return { lat: last.lat, lon: last.lon, segmentIndex: path.length - 2, segmentT: 1 };
}

function gaussian(x: number, y: number, zone: StressZone): number {
	const dx = (x - zone.x) / zone.rx;
	const dy = (y - zone.y) / zone.ry;
	return Math.exp(-(dx * dx + dy * dy) * 2.4);
}

function ndviAt(x: number, y: number, missionTime: number): number {
	let value = 0.73;
	for (const zone of STRESS_ZONES) {
		value -= zone.depth * gaussian(x, y, zone);
	}
	value += 0.015 * Math.sin(missionTime / 75 + x * 4.5);
	value += 0.01 * Math.cos(missionTime / 60 + y * 6.2);
	return clamp(value, 0.22, 0.85);
}

function stressFraction(): number {
	return 0.19;
}

function routeStateFromDistance(
	distanceM: number,
	path: Array<{ lat: number; lon: number }>,
	speedMps: number
) {
	const totalDist = pathDistanceMeters(path);
	const dist = totalDist > 0 ? ((distanceM % totalDist) + totalDist) % totalDist : 0;
	const pos = positionAlongPath(path, dist);
	const progress = totalDist > 0 ? clamp(dist / totalDist, 0, 1) : 0;

	const phase =
		progress < 0.12
			? MissionPhase.Transit
			: progress < 0.82
				? MissionPhase.Sweep
				: progress < 0.94
					? MissionPhase.Inspect
					: MissionPhase.Return;

	return {
		distanceM: dist,
		totalDistM: totalDist,
		segmentIndex: pos.segmentIndex,
		localProgress: pos.segmentT,
		phase,
		routeProgress: progress,
		lat: pos.lat,
		lon: pos.lon,
		speedMps: clamp(phase === MissionPhase.Inspect ? speedMps * 0.75 : speedMps, 3.5, 16.5)
	};
}

function fieldStats(elapsed: number) {
	const samples = [
		ndviAt(0.22, 0.24, elapsed),
		ndviAt(0.5, 0.28, elapsed),
		ndviAt(0.77, 0.33, elapsed),
		ndviAt(0.24, 0.72, elapsed),
		ndviAt(0.59, 0.67, elapsed),
		ndviAt(0.84, 0.8, elapsed)
	];
	const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
	return clamp(mean + 0.01 * Math.sin(elapsed / 95), 0.3, 0.82);
}

function missionTelemetry(
	elapsed: number,
	path: Array<{ lat: number; lon: number }>,
	cycleSec: number,
	distanceM: number,
	speedMps: number
) {
	const state = routeStateFromDistance(distanceM, path, speedMps);

	// Convert lat/lon back into normalized field coords for NDVI/stress synthesis.
	const x = (state.lon - FIELD.west) / (FIELD.east - FIELD.west);
	const y = (state.lat - FIELD.south) / (FIELD.north - FIELD.south);
	const xn = clamp(x, -0.25, 1.25);
	const yn = clamp(y, -0.25, 1.25);

	const targetNdvi = ndviAt(xn, yn, elapsed) + oscillate(elapsed, 0.006, 9, 4.8, 0.4);
	const fieldNdvi = fieldStats(elapsed) + oscillate(elapsed, 0.003, 16, 7.5, 1.2);
	const hotspotEffect = clamp((0.6 - targetNdvi) * 2.2, 0, 1);
	const canopyTemp = clamp(
		24 + hotspotEffect * 10 + 0.7 * Math.sin(elapsed / 32) + oscillate(elapsed, 0.22, 10, 4.5, 0.9),
		18,
		40
	);
	const soilMoisture = clamp(
		37 - hotspotEffect * 15 + 1.8 * Math.cos(elapsed / 58) + oscillate(elapsed, 0.35, 13, 6, 2.4),
		12,
		48
	);
	const batteryPct = clamp(
		100 - state.routeProgress * 72 + oscillate(elapsed, 0.18, 22, 9, 1.1),
		19,
		100
	);
	const coveragePct = clamp(
		state.phase === MissionPhase.Transit
			? 8 + state.routeProgress * 20
			: state.phase === MissionPhase.Sweep
				? 20 + state.routeProgress * 60
				: state.phase === MissionPhase.Inspect
					? 78 + state.routeProgress * 20
					: 96 + state.localProgress * 4,
		0,
		100
	);
	const windMps = clamp(
		4.8 + 1.3 * Math.sin(elapsed / 44) + 0.5 * Math.cos(elapsed / 18),
		2.4,
		9.6
	);
	const etaMin =
		state.totalDistM > 0 && speedMps > 0
			? clamp(((state.totalDistM - state.distanceM) / speedMps) / 60, 0, cycleSec / 60)
			: clamp(cycleSec / 60, 0, cycleSec / 60);
	const speed = clamp(
		state.speedMps + oscillate(elapsed, 0.22, 11, 5.2, 0.3),
		5.5,
		14.5
	);
	const altitude = clamp(
		state.phase === MissionPhase.Transit ? 72 : state.phase === MissionPhase.Return ? 68 : 58,
		52,
		75
	);

	return {
		lat: state.lat,
		lon: state.lon,
		alt: altitude,
		speed,
		fieldNdvi: clamp(fieldNdvi, 0.2, 0.9),
		targetNdvi: clamp(targetNdvi, 0.2, 0.9),
		stressPct: stressFraction() * 100 + 2.6 * Math.sin(elapsed / 80),
		canopyTemp,
		soilMoisture,
		batteryPct,
		coveragePct,
		windMps,
		etaMin,
		waypointIndex: state.segmentIndex + 1,
		phase: state.phase
	};
}

function uid() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseNdvi(detail: string | undefined): number | null {
	if (!detail) return null;
	const match = detail.match(/ndvi\s*([0-9]*\.?[0-9]+)/i);
	if (!match) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

function approxDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
	// Equirectangular approximation: good enough at field scale.
	const lat1 = (a.lat * Math.PI) / 180;
	const lat2 = (b.lat * Math.PI) / 180;
	const dLat = lat2 - lat1;
	const dLon = ((b.lon - a.lon) * Math.PI) / 180;
	const x = dLon * Math.cos((lat1 + lat2) / 2);
	return Math.sqrt(x * x + dLat * dLat) * EARTH_RADIUS_M;
}

function median(values: number[]): number {
	if (values.length === 0) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type NdviPoint = {
	lat: number;
	lon: number;
	ndvi: number;
};

function parseNdviPointsFromWaypoints(waypoints: MapWaypoint[] | null): NdviPoint[] {
	if (!waypoints?.length) return [];
	const out: NdviPoint[] = [];
	for (const w of waypoints) {
		const lat = Number((w as any).lat);
		const lon = Number((w as any).lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
		const ndvi = parseNdvi((w as any).detail);
		if (ndvi == null || !Number.isFinite(ndvi)) continue;
		out.push({ lat, lon, ndvi });
	}
	return out;
}

function nearestNdvi(lat: number, lon: number, points: NdviPoint[]): number | null {
	if (points.length === 0) return null;
	let best = points[0].ndvi;
	let bestD = Infinity;
	for (const p of points) {
		const dLat = p.lat - lat;
		const dLon = p.lon - lon;
		const d = dLat * dLat + dLon * dLon;
		if (d < bestD) {
			bestD = d;
			best = p.ndvi;
		}
	}
	return best;
}

type LocalXY = { x: number; y: number };

const FIELD_CENTER = {
	lat: (FIELD.south + FIELD.north) / 2,
	lon: (FIELD.west + FIELD.east) / 2
};

function toLocalMeters(p: { lat: number; lon: number }): LocalXY {
	const lat0 = (FIELD_CENTER.lat * Math.PI) / 180;
	const dLat = ((p.lat - FIELD_CENTER.lat) * Math.PI) / 180;
	const dLon = ((p.lon - FIELD_CENTER.lon) * Math.PI) / 180;
	return {
		x: dLon * Math.cos(lat0) * EARTH_RADIUS_M,
		y: dLat * EARTH_RADIUS_M
	};
}

function fromLocalMeters(p: LocalXY): { lat: number; lon: number } {
	const lat0 = (FIELD_CENTER.lat * Math.PI) / 180;
	const dLat = p.y / EARTH_RADIUS_M;
	const dLon = lat0 === 0 ? 0 : p.x / (EARTH_RADIUS_M * Math.cos(lat0));
	return {
		lat: FIELD_CENTER.lat + (dLat * 180) / Math.PI,
		lon: FIELD_CENTER.lon + (dLon * 180) / Math.PI
	};
}

function distanceLocal(a: LocalXY, b: LocalXY): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

function boustrophedonFieldPath(opts?: {
	lineSpacingM?: number;
	marginM?: number;
}): LatLon[] {
	// Simple full-coverage lawnmower pattern over the FIELD bbox.
	// We scan East/West endpoints while stepping North->South by lineSpacingM.
	const lineSpacingM = Math.max(10, opts?.lineSpacingM ?? 46);
	const marginM = Math.max(0, opts?.marginM ?? 8);

	const nw = toLocalMeters({ lat: FIELD.north, lon: FIELD.west });
	const se = toLocalMeters({ lat: FIELD.south, lon: FIELD.east });
	const minX = Math.min(nw.x, se.x) + marginM;
	const maxX = Math.max(nw.x, se.x) - marginM;
	const maxY = Math.max(nw.y, se.y) - marginM; // north
	const minY = Math.min(nw.y, se.y) + marginM; // south

	const out: LatLon[] = [];
	// Center each swath over the “row” it samples (not on the boundary between rows).
	const yStart = maxY - lineSpacingM / 2;
	const yEnd = minY + lineSpacingM / 2;
	let row = 0;
	for (let y = yStart; y >= yEnd; y -= lineSpacingM) {
		const forward = row % 2 === 0;
		// Two points per swath: one endpoint then the other (classic zig-zag).
		out.push(fromLocalMeters({ x: forward ? minX : maxX, y }));
		out.push(fromLocalMeters({ x: forward ? maxX : minX, y }));
		row += 1;
	}
	return out.length ? out : [{ lat: FIELD_CENTER.lat, lon: FIELD_CENTER.lon }];
}

function buildClusters(points: NdviPoint[], epsMeters: number, minPoints: number): NdviPoint[][] {
	// Simple DBSCAN-like clustering. O(n^2) is fine at demo scales.
	const visited = new Set<number>();
	const assigned = new Set<number>();
	const clusters: NdviPoint[][] = [];

	const locals = points.map((p) => ({ p, xy: toLocalMeters(p) }));

	function neighbors(i: number): number[] {
		const ni: number[] = [];
		const a = locals[i].xy;
		for (let j = 0; j < locals.length; j += 1) {
			if (i === j) continue;
			if (distanceLocal(a, locals[j].xy) <= epsMeters) ni.push(j);
		}
		return ni;
	}

	for (let i = 0; i < locals.length; i += 1) {
		if (visited.has(i)) continue;
		visited.add(i);
		const ns = neighbors(i);
		if (ns.length + 1 < minPoints) continue; // noise

		const clusterIdxs = new Set<number>([i]);
		const queue = [...ns];
		while (queue.length) {
			const j = queue.pop()!;
			if (!visited.has(j)) {
				visited.add(j);
				const ns2 = neighbors(j);
				if (ns2.length + 1 >= minPoints) {
					for (const k of ns2) queue.push(k);
				}
			}
			clusterIdxs.add(j);
		}

		const cluster: NdviPoint[] = [];
		for (const idx of clusterIdxs) {
			if (assigned.has(idx)) continue;
			assigned.add(idx);
			cluster.push(locals[idx].p);
		}
		if (cluster.length >= minPoints) clusters.push(cluster);
	}

	return clusters;
}

function nearestDistanceToClusterMeters(pt: LocalXY, clusterLocal: LocalXY[]): number {
	let best = Infinity;
	for (const c of clusterLocal) {
		const d = distanceLocal(pt, c);
		if (d < best) best = d;
	}
	return best;
}

function boustrophedonPathForCluster(
	cluster: NdviPoint[],
	opts: { lineSpacingM: number; sampleStepM: number; insideRadiusM: number; capPoints: number }
): NdviPoint[] {
	const clusterLocal = cluster.map((p) => toLocalMeters(p));
	const xs = clusterLocal.map((p) => p.x);
	const ys = clusterLocal.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);

	// Choose scan direction by bounding box aspect: sweep along the long axis.
	const w = maxX - minX;
	const h = maxY - minY;
	const sweepAlongX = w >= h;

	const lines: LocalXY[][] = [];
	if (sweepAlongX) {
		for (let y = minY; y <= maxY; y += opts.lineSpacingM) {
			const row: LocalXY[] = [];
			for (let x = minX; x <= maxX; x += opts.sampleStepM) row.push({ x, y });
			lines.push(row);
		}
	} else {
		for (let x = minX; x <= maxX; x += opts.lineSpacingM) {
			const col: LocalXY[] = [];
			for (let y = minY; y <= maxY; y += opts.sampleStepM) col.push({ x, y });
			lines.push(col);
		}
	}

	const out: NdviPoint[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = i % 2 === 0 ? lines[i] : [...lines[i]].reverse();
		for (const pt of line) {
			// Keep points that are “inside” the cluster (near some green point).
			const d = nearestDistanceToClusterMeters(pt, clusterLocal);
			if (d > opts.insideRadiusM) continue;
			const ll = fromLocalMeters(pt);
			out.push({
				lat: ll.lat,
				lon: ll.lon,
				ndvi: NaN // filled later (we use nearby cluster NDVI for label)
			});
			if (out.length >= opts.capPoints) return out;
		}
	}
	return out;
}

function snapNdviFromNearest(point: NdviPoint, cluster: NdviPoint[]): number {
	let best = cluster[0]?.ndvi ?? 0.6;
	let bestD = Infinity;
	for (const c of cluster) {
		const d = approxDistanceMeters(point, c);
		if (d < bestD) {
			bestD = d;
			best = c.ndvi;
		}
	}
	return best;
}

function buildClusterCoverageWaypoints(
	inputWaypoints: MapWaypoint[],
	jsonThreshold: number | null
): MapWaypoint[] {
	const points: NdviPoint[] = inputWaypoints
		.map((w) => ({ lat: Number(w.lat), lon: Number(w.lon), ndvi: parseNdvi(w.detail) }))
		.filter((p): p is NdviPoint => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.ndvi != null)
		.map((p) => ({ ...p, ndvi: p.ndvi! }));

	if (points.length < 12) return inputWaypoints;

	// Threshold: prefer the raster-derived threshold from the JSON header; else fall back to distribution.
	let threshold = jsonThreshold;
	if (!(threshold != null && Number.isFinite(threshold))) {
		const ndviValues = points.map((p) => p.ndvi);
		const ndviMed = median(ndviValues);
		const ndviQ3 = median(ndviValues.filter((v) => v >= ndviMed));
		threshold = clamp(Math.max(ndviMed, ndviQ3 - 0.02), 0.3, 0.9);
	}

	const green = points.filter((p) => p.ndvi >= (threshold ?? 0.55));
	if (green.length < 12) return inputWaypoints;

	// Cluster the green points into connected-ish regions.
	const epsMeters = 52; // neighbor radius; tuned for ~10m pixels (stride) & small gaps
	const minPoints = 10;
	const clusters = buildClusters(green, epsMeters, minPoints)
		// Skip tiny islands; keep clusters that are meaningful.
		.filter((c) => c.length >= 18);

	if (clusters.length === 0) return inputWaypoints;

	// Stable order: NW -> SE by centroid.
	const orderedClusters = clusters
		.map((cluster) => {
			const meanLat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
			const meanLon = cluster.reduce((s, p) => s + p.lon, 0) / cluster.length;
			return { cluster, meanLat, meanLon };
		})
		.sort((a, b) => (b.meanLat - a.meanLat) * 2 + (a.meanLon - b.meanLon));

	const capTotal = 220;
	const outWaypoints: MapWaypoint[] = [];
	let globalIdx = 0;
	for (const { cluster } of orderedClusters) {
		const scan = boustrophedonPathForCluster(cluster, {
			lineSpacingM: 46,
			sampleStepM: 34,
			insideRadiusM: 42,
			capPoints: capTotal - outWaypoints.length
		});

		for (const p of scan) {
			const ndvi = snapNdviFromNearest(p, cluster);
			const idx = globalIdx;
			globalIdx += 1;
			outWaypoints.push({
				lat: p.lat,
				lon: p.lon,
				detail: `NDVI ${ndvi.toFixed(2)}`,
				color: '#64748b',
				markerSize: ndvi >= (threshold ?? 0.55) + 0.08 ? 5 : 4,
				label: idx % 20 === 0 ? `WP-${String(Math.floor(idx / 20) + 1).padStart(2, '0')}` : ''
			});
			if (outWaypoints.length >= capTotal) break;
		}
		if (outWaypoints.length >= capTotal) break;
	}

	return outWaypoints.length ? outWaypoints : inputWaypoints;
}

function readNdviWaypoints(): MapWaypoint[] | null {
	const rel = 'static/assets/agri/ndvi-s2-bbox.waypoints.json';
	const legacyRel = 'assets/agri/ndvi-s2-bbox.waypoints.json';
	const candidates = [
		// typical: cwd is repo root
		join(process.cwd(), rel),
		join(process.cwd(), 'mcs', rel),
		// legacy: waypoints checked in under repoRoot/assets/agri/
		join(process.cwd(), legacyRel),
		// legacy: cwd is mcs/
		join(process.cwd(), '..', legacyRel)
	];
	for (const p of candidates) {
		if (!existsSync(p)) continue;
		try {
			const raw = readFileSync(p, 'utf-8');
			const parsed = JSON.parse(raw) as { threshold?: unknown; waypoints?: unknown };
			if (!Array.isArray(parsed.waypoints)) return null;
			const threshold =
				parsed.threshold !== undefined && parsed.threshold !== null ? Number(parsed.threshold) : null;
			const waypoints = parsed.waypoints
				.map((w) => ({
					lat: Number((w as any).lat),
					lon: Number((w as any).lon),
					label: typeof (w as any).label === 'string' ? (w as any).label : undefined,
					detail: typeof (w as any).detail === 'string' ? (w as any).detail : undefined,
					color: typeof (w as any).color === 'string' ? (w as any).color : undefined,
					markerSize:
						(w as any).markerSize !== undefined ? Number((w as any).markerSize) : undefined
				}))
				.filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lon));
			return waypoints.length ? buildClusterCoverageWaypoints(waypoints, threshold) : [];
		} catch (error) {
			logger.warn(TAG, 'Failed to read NDVI waypoints JSON', { path: p, error });
			return null;
		}
	}
	return null;
}

function fieldOverlayProps() {
	const ndviWaypoints = readNdviWaypoints();
	const coveragePath = boustrophedonFieldPath();
	return {
		gpsStreamId: 'agri:gps',
		baseLayer: 'satellite',
		showBaseLayer: true,
		baseLayerOpacity: 1,
		centerLat: (FIELD.south + FIELD.north) / 2,
		centerLon: (FIELD.west + FIELD.east) / 2,
		zoom: 15,
		showGpsTrail: false,
		trailWindowSec: CYCLE_SEC,
		trailMaxPoints: 800,
		trailColor: '#38bdf8',
		showMarker: true,
		autoFollow: false,
		showInspector: true,
		// Prefer the Sentinel-2 raster output from `mcs/scripts/fetch-s2-ndvi.mjs`.
		// If that file isn't present in this checkout, fall back to the checked-in SVG
		// so the demo still renders an overlay.
		overlayImageUrl: '/assets/agri/ndvi-s2-bbox.png',
		overlayImageUrlFallback: '/assets/agri/ndvi-field-overlay.svg',
		overlayLabel: 'NDVI',
		showOverlay: true,
		overlayLegendMinLabel: '0.00',
		overlayLegendMaxLabel: '1.00',
		overlayOpacity: 0.8,
		overlayBlendMode: 'multiply',
		overlaySouth: FIELD.south,
		overlayWest: FIELD.west,
		overlayNorth: FIELD.north,
		overlayEast: FIELD.east,
		showWaypointPath: true,
		waypointPathColor: '#94a3b8',
		waypointPathOpacity: 0.42,
		showWaypointLabels: false,
		missionSpeed: 0.8,
		waypoints: coveragePath.map((p, idx) => ({
			lat: p.lat,
			lon: p.lon,
			label: idx % 80 === 0 ? `SWATH-${String(Math.floor(idx / 80) + 1).padStart(2, '0')}` : '',
			detail: ndviWaypoints?.length ? `NDVI (truth loaded; sampling live)` : 'Coverage pass waypoint',
			color: '#64748b',
			markerSize: 3
		}))
	};
}

function scaffoldObjects(projectPath: string, rootId: string): void {
	const tree = objectsDb.getObjectTree(projectPath);
	if (!tree) return;

	const existingFolder = tree.children?.find((child) => child.name === 'Agriculture demo');
	if (existingFolder) {
		// Project already has the demo; ensure the map overlay props stay current.
		const existingMap = existingFolder.children?.find(
			(child) => child.type === 'map-view' && child.name === 'Field Overlay'
		);
		if (existingMap) {
			objectsDb.updateObject(projectPath, existingMap.id, {
				props: {
					...existingMap.props,
					...fieldOverlayProps()
				}
			});
		}

		const byName = (type: string, name: string) =>
			existingFolder.children?.find((child) => child.type === type && child.name === name);

		const existingLayout = byName('flex-layout', 'Field layout');
		const fieldMap = byName('map-view', 'Field Overlay');
		const ndviPlot = byName('overlay-plot', 'Vegetation vs Thermal Stress');
		const missionStatus = byName('summary-widget', 'Mission Status');
		const targetGauge = byName('gauge', 'Current Pass NDVI');
		const batteryGauge = byName('gauge', 'Battery Reserve');
		const coverageGauge = byName('gauge', 'Coverage Complete');
		const missionTable = byName('telemetry-table', 'Mission Metrics');

		if (
			existingLayout &&
			fieldMap &&
			ndviPlot &&
			missionStatus &&
			targetGauge &&
			batteryGauge &&
			coverageGauge &&
			missionTable
		) {
			objectsDb.updateObject(projectPath, existingLayout.id, {
				props: {
					...existingLayout.props,
					root: {
						id: uid(),
						type: 'split',
						direction: 'vertical',
						ratio: 0.72,
						children: [
							{
								id: uid(),
								type: 'split',
								direction: 'horizontal',
								ratio: 0.66,
								children: [
									{ id: uid(), type: 'leaf', objectId: fieldMap.id },
									{
										id: uid(),
										type: 'split',
										direction: 'vertical',
										ratio: 0.3,
										children: [
											{ id: uid(), type: 'leaf', objectId: missionStatus.id },
											{
												id: uid(),
												type: 'split',
												direction: 'vertical',
												ratio: 0.5,
												children: [
													{ id: uid(), type: 'leaf', objectId: targetGauge.id },
													{
														id: uid(),
														type: 'split',
														direction: 'vertical',
														ratio: 0.5,
														children: [
															{ id: uid(), type: 'leaf', objectId: batteryGauge.id },
															{ id: uid(), type: 'leaf', objectId: coverageGauge.id }
														]
													}
												]
											}
										]
									}
								]
							},
							{
								id: uid(),
								type: 'split',
								direction: 'horizontal',
								ratio: 1 / 3,
								children: [
									{ id: uid(), type: 'leaf', objectId: ndviPlot.id },
									{ id: uid(), type: 'leaf', objectId: missionTable.id }
								]
							}
						]
					}
				}
			});
		}

		return;
	}

	const folder = objectsDb.createObject(projectPath, {
		type: 'folder',
		parentId: rootId,
		name: 'Agriculture demo',
		notes:
			'Field scouting demo: Sentinel-2 (10m) NDVI raster overlay + NDVI-driven search path over the configured bounds, plus synthetic agri:* streams.'
	});

	const fieldMap = objectsDb.createObject(projectPath, {
		type: 'map-view',
		parentId: folder.id,
		name: 'Field Overlay',
		props: fieldOverlayProps()
	});

	const ndviPlot = objectsDb.createObject(projectPath, {
		type: 'overlay-plot',
		parentId: folder.id,
		name: 'Vegetation vs Thermal Stress',
		props: {
			showGrid: true,
			pollInterval: 1000,
			xAxis: { label: 'UTC time' },
			yAxis: { label: 'NDVI', min: 0.2, max: 0.85 },
			yAxisRight: { label: 'Canopy Temp (°C)', min: 18, max: 40 },
			referenceLines: [
				{
					type: 'constant',
					value: 0.4,
					label: 'Scout threshold',
					color: '#78716c',
					style: 'dashed'
				}
			],
			series: [
				{ dataSource: 'agri:field_ndvi', name: 'Field mean NDVI', color: '#15803d', axis: 'left' },
				{
					dataSource: 'agri:target_ndvi',
					name: 'Current pass NDVI',
					color: '#0d9488',
					axis: 'left'
				},
				{ dataSource: 'agri:canopy_temp', name: 'Canopy temp', color: '#b45309', axis: 'right' }
			]
		}
	});

	const missionStatus = objectsDb.createObject(projectPath, {
		type: 'summary-widget',
		parentId: folder.id,
		name: 'Mission Status',
		props: {
			okLabel: 'Systems nominal',
			okDetail: '',
			okColor: '#238636',
			showDetail: false,
			ruleOrder: 'severity',
			rules: [
				{
					streamId: 'agri:target_ndvi',
					op: 'lt',
					threshold: 0.35,
					label: 'Critical crop stress',
					message: 'Dispatch agronomist to active zone',
					color: '#ef4444'
				},
				{
					streamId: 'agri:battery_pct',
					op: 'lt',
					threshold: 28,
					label: 'Battery reserve low',
					message: 'Prioritize RTB after current segment',
					color: '#ef4444'
				},
				{
					streamId: 'agri:wind_mps',
					op: 'gt',
					threshold: 8.5,
					label: 'Wind envelope warning',
					message: 'Reduce groundspeed over hotspots',
					color: '#d29922'
				},
				{
					streamId: 'agri:stress_pct',
					op: 'gt',
					threshold: 24,
					label: 'Anomaly footprint expanded',
					message: 'Add a fourth scout pass',
					color: '#d29922'
				}
			]
		}
	});

	const batteryGauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Battery Reserve',
		props: {
			dataSource: 'agri:battery_pct',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			thresholdMin: 25,
			warningMin: 35,
			normalColor: '#22c55e',
			warningColor: '#f59e0b',
			alarmColor: '#ef4444',
			precision: 0,
			showRangeLabels: false,
			trackOpacity: 0.52,
			thresholdOpacity: 0.34
		}
	});

	const coverageGauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Coverage Complete',
		props: {
			dataSource: 'agri:coverage_pct',
			displayType: 'linear',
			min: 0,
			max: 100,
			unit: '%',
			normalColor: '#2dd4bf',
			warningColor: '#f59e0b',
			alarmColor: '#ef4444',
			precision: 0,
			showRangeLabels: false,
			trackOpacity: 0.5
		}
	});

	const targetGauge = objectsDb.createObject(projectPath, {
		type: 'gauge',
		parentId: folder.id,
		name: 'Current Pass NDVI',
		props: {
			dataSource: 'agri:target_ndvi',
			displayType: 'dial',
			min: 0.2,
			max: 0.85,
			unit: 'NDVI',
			thresholdMin: 0.35,
			warningMin: 0.45,
			normalColor: '#22c55e',
			warningColor: '#f59e0b',
			alarmColor: '#ef4444',
			precision: 2,
			showRangeLabels: false
		}
	});

	const missionTable = objectsDb.createObject(projectPath, {
		type: 'telemetry-table',
		parentId: folder.id,
		name: 'Mission Metrics',
		props: {
			rowLimit: 240,
			columns: [
				{ streamId: 'agri:field_ndvi', label: 'Field NDVI', warningBelow: 0.45, alarmBelow: 0.38 },
				{ streamId: 'agri:target_ndvi', label: 'Pass NDVI', warningBelow: 0.42, alarmBelow: 0.35 },
				{ streamId: 'agri:stress_pct', label: 'Stress %', warningAbove: 18, alarmAbove: 24 },
				{ streamId: 'agri:canopy_temp', label: 'Canopy °C', warningAbove: 31, alarmAbove: 34 },
				{ streamId: 'agri:soil_moisture', label: 'Moisture %', warningBelow: 24, alarmBelow: 20 },
				{ streamId: 'agri:battery_pct', label: 'Battery %', warningBelow: 35, alarmBelow: 25 },
				{ streamId: 'agri:coverage_pct', label: 'Coverage %', warningBelow: 95, alarmBelow: 85 },
				{ streamId: 'agri:wind_mps', label: 'Wind m/s', warningAbove: 7.5, alarmAbove: 8.5 },
				{ streamId: 'agri:eta_min', label: 'ETA min' },
				{ streamId: 'agri:waypoint_index', label: 'Waypoint' }
			]
		}
	});

	const missionEpoch = Math.floor(Date.now() / 1000);
	void missionEpoch;

	objectsDb.createObject(projectPath, {
		type: 'flex-layout',
		parentId: folder.id,
		name: 'Field layout',
		props: {
			root: {
				id: uid(),
				type: 'split',
				direction: 'vertical',
				ratio: 0.72,
				children: [
					{
						id: uid(),
						type: 'split',
						direction: 'horizontal',
						ratio: 0.66,
						children: [
							{ id: uid(), type: 'leaf', objectId: fieldMap.id },
							{
								id: uid(),
								type: 'split',
								direction: 'vertical',
								ratio: 0.3,
								children: [
									{ id: uid(), type: 'leaf', objectId: missionStatus.id },
									{
										id: uid(),
										type: 'split',
										direction: 'vertical',
										ratio: 0.5,
										children: [
											{ id: uid(), type: 'leaf', objectId: targetGauge.id },
											{
												id: uid(),
												type: 'split',
												direction: 'vertical',
												ratio: 0.5,
												children: [
													{ id: uid(), type: 'leaf', objectId: batteryGauge.id },
													{ id: uid(), type: 'leaf', objectId: coverageGauge.id }
												]
											}
										]
									}
								]
							}
						]
					},
					{
						id: uid(),
						type: 'split',
						direction: 'horizontal',
						ratio: 1 / 3,
						children: [
							{ id: uid(), type: 'leaf', objectId: ndviPlot.id },
							{ id: uid(), type: 'leaf', objectId: missionTable.id }
						]
					}
				]
			}
		}
	});

	logger.info(TAG, 'Scaffolded Agriculture demo objects', { folderId: folder.id });
}

export function registerAgriNdviMissionPlugin(): void {
	registerInProcess({
		id: 'agri-ndvi-mission',
		name: 'Agriculture demo',
		type: 'in-process',
		version: '1.0.0',
		description:
			'Field scouting demo: Sentinel-2 (10m) NDVI overlay + NDVI-driven search path over configured bounds, plus synthetic agri streams for maps, plots, and tables.',
		capabilities: ['streams', 'objects', 'layouts', 'map-overlays'],
		streams: STREAMS.map((stream) => ({
			id: stream.id,
			name: stream.name,
			metadata: { unit: stream.unit, min: stream.min, max: stream.max }
		})),

		run(ctx: InProcessPluginContext) {
			const projectPath = getProjectPathById(ctx.projectId);
			if (!projectPath) {
				logger.warn(TAG, 'Project not found; cannot start plugin', { projectId: ctx.projectId });
				return;
			}

			for (const stream of STREAMS) {
				streamsDb.ensureStream(projectPath, stream.id, stream.name);
				streamsDb.updateStreamMetadata(projectPath, stream.id, {
					unit: stream.unit,
					min: stream.min,
					max: stream.max,
					source: TAG
				});
			}

			const tree = objectsDb.getObjectTree(projectPath);
			if (tree) {
				scaffoldObjects(projectPath, tree.id);
				// In-process scaffolding bypasses the API layer, so emit a change event for the UI Explorer.
				projectChanges.notify(ctx.projectId, { type: 'tree-changed' });
			}

			logger.info(TAG, 'Started; ingesting agriculture demo telemetry', {
				projectId: ctx.projectId,
				field: FIELD.name,
				gpsHz: 1000 / GPS_INTERVAL_MS,
				metricHz: 1
			});

			const fieldMapId = findFieldOverlayMapId(projectPath);
			let missionSpeed = 1;
			if (fieldMapId) {
				const mapObj = objectsDb.getObject(projectPath, fieldMapId);
				missionSpeed = clampMissionSpeed((mapObj?.props as any)?.missionSpeed);
			}

			// Refresh speed occasionally so the Properties panel can adjust it live.
			let speedTick = 0;
			let distanceM = 0;
			let lastTickSec: number | null = null;

			const ndviWaypoints = readNdviWaypoints();
			const ndviPoints = parseNdviPointsFromWaypoints(ndviWaypoints);
			let runningNdviSum = 0;
			let runningNdviCount = 0;
			let lastSampleLat = NaN;
			let lastSampleLon = NaN;
			const activePath: Array<{ lat: number; lon: number }> = boustrophedonFieldPath();

			const startEpoch = Date.now() / 1000;
			let tickCount = 0;
			const timer = setInterval(() => {
				try {
					tickCount += 1;
					const nowSec = Date.now() / 1000;
					const elapsed = nowSec - startEpoch;
					speedTick += 1;
					if (fieldMapId && speedTick % 8 === 0) {
						const mapObj = objectsDb.getObject(projectPath, fieldMapId);
						missionSpeed = clampMissionSpeed((mapObj?.props as any)?.missionSpeed);
					}
					const cycleSec = CYCLE_SEC / Math.max(0.25, missionSpeed);
					const totalDist = pathDistanceMeters(activePath);
					// Integrate distance over time so speed changes don't teleport the drone.
					// Keep state within the plugin closure to preserve continuity.
					if (lastTickSec == null) lastTickSec = nowSec;
					const dt = Math.max(0, Math.min(1.5, nowSec - lastTickSec));
					lastTickSec = nowSec;
					const baseSpeed = totalDist > 0 ? totalDist / cycleSec : 8;
					distanceM = totalDist > 0 ? (distanceM + baseSpeed * dt) % totalDist : 0;

					const telemetry = missionTelemetry(elapsed, activePath, cycleSec, distanceM, baseSpeed);
					const ndviTruth = nearestNdvi(telemetry.lat, telemetry.lon, ndviPoints);
					const targetNdvi = ndviTruth != null ? clamp(ndviTruth, 0, 1) : telemetry.targetNdvi;

					// Running field mean based on spatially-distinct samples.
					const movedEnough =
						Number.isFinite(lastSampleLat) &&
						Number.isFinite(lastSampleLon) &&
						approxDistanceMeters({ lat: lastSampleLat, lon: lastSampleLon }, { lat: telemetry.lat, lon: telemetry.lon }) >
							18;
					if (!Number.isFinite(lastSampleLat) || !Number.isFinite(lastSampleLon) || movedEnough) {
						lastSampleLat = telemetry.lat;
						lastSampleLon = telemetry.lon;
						if (ndviTruth != null) {
							runningNdviSum += targetNdvi;
							runningNdviCount += 1;
						}
					}
					const fieldNdvi =
						runningNdviCount > 0 ? clamp(runningNdviSum / runningNdviCount, 0, 1) : telemetry.fieldNdvi;

					ctx.ingest('agri:gps', {
						lat: telemetry.lat,
						lon: telemetry.lon,
						alt: telemetry.alt,
						speed: telemetry.speed
					});

					if (tickCount % METRIC_INTERVAL_TICKS !== 0) return;

					ctx.ingest('agri:field_ndvi', { value: fieldNdvi });
					ctx.ingest('agri:target_ndvi', { value: targetNdvi });
					ctx.ingest('agri:stress_pct', { value: telemetry.stressPct });
					ctx.ingest('agri:canopy_temp', { value: telemetry.canopyTemp });
					ctx.ingest('agri:soil_moisture', { value: telemetry.soilMoisture });
					ctx.ingest('agri:battery_pct', { value: telemetry.batteryPct });
					ctx.ingest('agri:coverage_pct', { value: telemetry.coveragePct });
					ctx.ingest('agri:wind_mps', { value: telemetry.windMps });
					ctx.ingest('agri:eta_min', { value: telemetry.etaMin });
					ctx.ingest('agri:waypoint_index', { value: telemetry.waypointIndex });
					ctx.ingest('agri:mission_phase', { value: telemetry.phase });
				} catch (error) {
					logger.exception(TAG, 'Ingest error', error);
				}
			}, GPS_INTERVAL_MS);

			ctx.onStop = () => {
				clearInterval(timer);
				logger.info(TAG, 'Stopped');
			};
		}
	});
}
