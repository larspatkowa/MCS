#!/usr/bin/env node
/**
 * Fetch a high-resolution (10m) NDVI raster from Sentinel-2 L2A via STAC + COGs,
 * render to a PNG, and write a waypoint path over "green" pixels.
 *
 * Data source: Microsoft Planetary Computer STAC API + SAS tokens.
 *
 * Defaults are tuned to the repo's Agriculture demo bbox (Iowa):
 *   west=-93.678317, south=41.979554, east=-93.658764, north=41.993814
 *
 * Usage (from repo root):
 *   node mcs/scripts/fetch-s2-ndvi.mjs
 *
 * Optional env vars:
 * - MCS_BBOX_WEST / SOUTH / EAST / NORTH
 * - MCS_TIME_RANGE: ISO interval, e.g. "2025-04-01/2026-04-01"
 * - MCS_MAX_ITEMS: max STAC candidates to examine (default 25)
 * - MCS_MAX_CLOUD: max eo:cloud_cover percentage (default 60)
 * - MCS_OUT_PNG: output path (default mcs/static/assets/agri/ndvi-s2-bbox.png)
 * - MCS_OUT_META: output meta path
 * - MCS_OUT_WAYPOINTS: output waypoints JSON path
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import proj4 from 'proj4';
import { fromUrl } from 'geotiff';
import { PNG } from 'pngjs';

const STAC_API = 'https://planetarycomputer.microsoft.com/api/stac/v1';
const SAS_TOKEN_ENDPOINT = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a';
const COLLECTION = 'sentinel-2-l2a';

function numEnv(name, fallback) {
	const raw = process.env[name];
	if (raw === undefined || raw === '') return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) throw new Error(`Invalid ${name}: ${raw}`);
	return n;
}
function strEnv(name, fallback) {
	const raw = process.env[name];
	return raw === undefined || raw === '' ? fallback : raw;
}

function defaultTimeRange() {
	// last 12 months, inclusive-ish.
	const end = new Date();
	const start = new Date(end);
	start.setUTCMonth(start.getUTCMonth() - 12);
	return `${start.toISOString().slice(0, 10)}/${end.toISOString().slice(0, 10)}`;
}

const bbox = {
	west: numEnv('MCS_BBOX_WEST', -93.678317),
	south: numEnv('MCS_BBOX_SOUTH', 41.979554),
	east: numEnv('MCS_BBOX_EAST', -93.658764),
	north: numEnv('MCS_BBOX_NORTH', 41.993814)
};

const timeRange = strEnv('MCS_TIME_RANGE', defaultTimeRange());
const maxItems = Math.max(1, Math.min(200, Math.round(numEnv('MCS_MAX_ITEMS', 25))));
const maxCloud = Math.max(0, Math.min(100, numEnv('MCS_MAX_CLOUD', 60)));

const OUT_PNG = resolve(
	process.cwd(),
	strEnv('MCS_OUT_PNG', 'mcs/static/assets/agri/ndvi-s2-bbox.png')
);
const OUT_META = resolve(
	process.cwd(),
	strEnv('MCS_OUT_META', 'mcs/static/assets/agri/ndvi-s2-bbox.meta.json')
);
const OUT_WAYPOINTS = resolve(
	process.cwd(),
	strEnv('MCS_OUT_WAYPOINTS', 'mcs/static/assets/agri/ndvi-s2-bbox.waypoints.json')
);

async function fetchJson(url, init) {
	const res = await fetch(url, init);
	if (!res.ok) {
		const t = await res.text().catch(() => '');
		throw new Error(`${res.status} ${url} ${t}`.trim());
	}
	return await res.json();
}

async function getSasToken() {
	const data = await fetchJson(SAS_TOKEN_ENDPOINT);
	const token = String(data?.token ?? '');
	if (!token) throw new Error('Missing SAS token');
	return token;
}

function signedHref(href, token) {
	if (!href) return href;
	return href.includes('?') ? `${href}&${token}` : `${href}?${token}`;
}

async function stacSearch() {
	const body = {
		collections: [COLLECTION],
		bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
		datetime: timeRange,
		limit: maxItems,
		query: { 'eo:cloud_cover': { lte: maxCloud } }
	};
	const data = await fetchJson(`${STAC_API}/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const features = Array.isArray(data?.features) ? data.features : [];
	return features;
}

function getCloud(item) {
	const v = item?.properties?.['eo:cloud_cover'];
	return Number.isFinite(Number(v)) ? Number(v) : 1000;
}

function getEpsg(item) {
	const epsg = Number(item?.properties?.['proj:epsg']);
	return Number.isFinite(epsg) ? epsg : null;
}

function pickBestItem(items) {
	return [...items].sort((a, b) => getCloud(a) - getCloud(b))[0] ?? null;
}

function lonLatToProjBounds(epsg) {
	const src = 'EPSG:4326';
	const dst = `EPSG:${epsg}`;
	const fwd = proj4(src, dst);
	const pts = [
		fwd.forward([bbox.west, bbox.north]),
		fwd.forward([bbox.east, bbox.north]),
		fwd.forward([bbox.east, bbox.south]),
		fwd.forward([bbox.west, bbox.south])
	];
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	return {
		minX: Math.min(...xs),
		maxX: Math.max(...xs),
		minY: Math.min(...ys),
		maxY: Math.max(...ys),
		toLonLat: (xy) => proj4(dst, src).forward(xy)
	};
}

function clamp(n, lo, hi) {
	return Math.max(lo, Math.min(hi, n));
}

function computeWindow(image, projBounds) {
	// GeoTIFF origin/resolution are in projected coords.
	const [originX, originY] = image.getOrigin();
	const [resX, resY] = image.getResolution(); // resY is often negative
	const width = image.getWidth();
	const height = image.getHeight();

	const x1 = projBounds.minX;
	const x2 = projBounds.maxX;
	const y1 = projBounds.minY;
	const y2 = projBounds.maxY;

	const px1 = (x1 - originX) / resX;
	const px2 = (x2 - originX) / resX;
	const py1 = (y1 - originY) / resY;
	const py2 = (y2 - originY) / resY;

	const minPx = Math.floor(Math.min(px1, px2));
	const maxPx = Math.ceil(Math.max(px1, px2));
	const minPy = Math.floor(Math.min(py1, py2));
	const maxPy = Math.ceil(Math.max(py1, py2));

	const wMinX = clamp(minPx, 0, width - 1);
	const wMaxX = clamp(maxPx, 1, width);
	const wMinY = clamp(minPy, 0, height - 1);
	const wMaxY = clamp(maxPy, 1, height);

	return [wMinX, wMinY, wMaxX, wMaxY];
}

function ndviRamp(ndvi) {
	// Color ramp similar to common NDVI palettes.
	// Returns [r,g,b,a]
	if (!Number.isFinite(ndvi)) return [0, 0, 0, 0];
	const v = clamp(ndvi, -1, 1);
	if (v < 0) {
		// water/urban-ish: dark slate
		return [20, 24, 40, 180];
	}
	if (v < 0.2) return [122, 58, 36, 210]; // brown
	if (v < 0.35) return [176, 90, 46, 220]; // tan
	if (v < 0.5) return [226, 154, 62, 230]; // orange
	if (v < 0.65) return [216, 195, 73, 235]; // yellow-green
	if (v < 0.8) return [125, 190, 82, 240]; // green
	return [43, 125, 60, 245]; // dark green
}

function percentile(sorted, p) {
	if (sorted.length === 0) return NaN;
	const idx = (sorted.length - 1) * p;
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sorted[lo];
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function buildWaypoints(ndvi, w, h, projBounds, window, threshold) {
	// Downsample & spacing to keep waypoint counts reasonable.
	const stride = 3; // 10m pixels => ~30m
	const points = [];

	const [winX1, winY1] = window;
	for (let y = 0; y < h; y += stride) {
		for (let x = 0; x < w; x += stride) {
			const v = ndvi[y * w + x];
			if (!Number.isFinite(v) || v < threshold) continue;
			points.push({ x, y, v });
		}
	}

	// Bin into rows by y, alternate direction (lawnmower).
	const rowSize = Math.max(1, Math.round(24 / stride)); // ~240m bands / adapt
	const rows = new Map();
	for (const p of points) {
		const row = Math.floor(p.y / rowSize);
		const arr = rows.get(row) ?? [];
		arr.push(p);
		rows.set(row, arr);
	}
	const rowKeys = [...rows.keys()].sort((a, b) => a - b);

	const ordered = [];
	for (let i = 0; i < rowKeys.length; i++) {
		const key = rowKeys[i];
		const arr = rows.get(key) ?? [];
		arr.sort((a, b) => a.x - b.x);
		if (i % 2 === 1) arr.reverse();
		ordered.push(...arr);
	}

	// Cap to avoid blowing up UI.
	const capped = ordered.slice(0, 350);

	// Convert pixel centers to lon/lat using image georeference approximation:
	// We convert from pixel coords -> projected coords using origin/resolution inferred earlier.
	// We only need consistency for waypoint display, not centimeter accuracy.
	const lonLatPts = capped.map((p) => {
		// Map pixel -> projected coordinate:
		// We approximate using bounds of bbox in projected space.
		const fracX = (p.x + 0.5) / w;
		const fracY = (p.y + 0.5) / h;
		const projX = projBounds.minX + (projBounds.maxX - projBounds.minX) * fracX;
		const projY = projBounds.maxY - (projBounds.maxY - projBounds.minY) * fracY;
		const [lon, lat] = projBounds.toLonLat([projX, projY]);
		return {
			lat,
			lon,
			label: '',
			detail: `NDVI ${p.v.toFixed(2)}`,
			color: '#64748b',
			markerSize: 4
		};
	});

	return lonLatPts;
}

function unpackRaster(result) {
	// geotiff.js can return either a TypedArray (when interleave=true and one sample),
	// or an array of TypedArrays (when multiple samples), or an object wrapper.
	if (!result) return null;
	if (ArrayBuffer.isView(result) && typeof result.length === 'number') return result;
	if (Array.isArray(result) && result.length > 0) {
		const first = result[0];
		if (ArrayBuffer.isView(first)) return first;
	}
	// Some versions return { data: [typedArray] }
	if (Array.isArray(result.data) && result.data.length > 0 && ArrayBuffer.isView(result.data[0])) {
		return result.data[0];
	}
	return null;
}

async function main() {
	const items = await stacSearch();
	if (items.length === 0) throw new Error('No Sentinel-2 items found for bbox/time range');

	const best = pickBestItem(items);
	if (!best) throw new Error('No suitable Sentinel-2 item');

	const epsg = getEpsg(best);
	if (!epsg) throw new Error('Missing proj:epsg in STAC item');

	const token = await getSasToken();
	const redHref = signedHref(best?.assets?.B04?.href, token);
	const nirHref = signedHref(best?.assets?.B08?.href, token);
	if (!redHref || !nirHref) throw new Error('Missing B04/B08 assets on item');

	const projBounds = lonLatToProjBounds(epsg);

	const redTiff = await fromUrl(redHref);
	const nirTiff = await fromUrl(nirHref);
	const redImg = await redTiff.getImage();
	const nirImg = await nirTiff.getImage();

	const window = computeWindow(redImg, projBounds);
	const [x1, y1, x2, y2] = window;
	const outW = x2 - x1;
	const outH = y2 - y1;
	if (outW <= 4 || outH <= 4) throw new Error(`Computed window too small: ${outW}x${outH}`);

	const redRaw = await redImg.readRasters({ window, interleave: true, samples: [0] });
	const nirRaw = await nirImg.readRasters({ window, interleave: true, samples: [0] });
	const red = unpackRaster(redRaw);
	const nir = unpackRaster(nirRaw);
	if (!red || !nir) throw new Error('Could not unpack rasters');

	const n = outW * outH;
	const ndvi = new Float32Array(n);
	const valid = [];
	let min = Infinity;
	let max = -Infinity;
	let sum = 0;
	let count = 0;
	for (let i = 0; i < n; i++) {
		const r = Number(red[i]);
		const ni = Number(nir[i]);
		const denom = ni + r;
		const v = denom === 0 ? NaN : (ni - r) / denom;
		ndvi[i] = v;
		if (Number.isFinite(v)) {
			valid.push(v);
			min = Math.min(min, v);
			max = Math.max(max, v);
			sum += v;
			count += 1;
		}
	}
	valid.sort((a, b) => a - b);
	const mean = count ? sum / count : NaN;
	const p70 = percentile(valid, 0.7);
	const threshold = clamp(Math.max(0.45, p70), 0.35, 0.7);

	// Render PNG
	const png = new PNG({ width: outW, height: outH });
	for (let y = 0; y < outH; y++) {
		for (let x = 0; x < outW; x++) {
			const idx = y * outW + x;
			const [r, g, b, a] = ndviRamp(ndvi[idx]);
			const p = idx * 4;
			png.data[p] = r;
			png.data[p + 1] = g;
			png.data[p + 2] = b;
			png.data[p + 3] = a;
		}
	}

	mkdirSync(dirname(OUT_PNG), { recursive: true });
	writeFileSync(OUT_PNG, PNG.sync.write(png));

	const waypoints = buildWaypoints(ndvi, outW, outH, projBounds, window, threshold);

	const meta = {
		collection: COLLECTION,
		itemId: String(best?.id ?? ''),
		datetime: String(best?.properties?.datetime ?? ''),
		cloudCover: getCloud(best),
		epsg,
		bbox,
		timeRange,
		window: { x1, y1, x2, y2, width: outW, height: outH },
		ndvi: {
			min: Number.isFinite(min) ? min : null,
			max: Number.isFinite(max) ? max : null,
			mean: Number.isFinite(mean) ? mean : null,
			p70: Number.isFinite(p70) ? p70 : null,
			threshold
		},
		waypoints: { count: waypoints.length }
	};

	writeFileSync(OUT_META, JSON.stringify(meta, null, 2));
	writeFileSync(OUT_WAYPOINTS, JSON.stringify({ bbox, epsg, threshold, waypoints }, null, 2));

	// eslint-disable-next-line no-console
	console.log(
		`Wrote ${OUT_PNG} (${outW}x${outH}), waypoints=${waypoints.length}, cloud=${meta.cloudCover}, threshold=${threshold.toFixed(
			2
		)}`
	);
}

await main();

