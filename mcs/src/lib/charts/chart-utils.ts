/**
 * Shared SVG chart utilities for MCS visualization components.
 * No external dependencies — pure math and string generation.
 */

/** Consistent series palette across all chart types, defined per theme in theme.css. */
export const SERIES_COLORS = [
	'var(--mcs-series-1)',
	'var(--mcs-series-2)',
	'var(--mcs-series-3)',
	'var(--mcs-series-4)',
	'var(--mcs-series-5)',
	'var(--mcs-series-6)',
	'var(--mcs-series-7)',
	'var(--mcs-series-8)'
] as const;

/** Map a value from domain to range linearly. Returns a function. */
export function linearScale(
	domain: [number, number],
	range: [number, number]
): (v: number) => number {
	const [d0, d1] = domain;
	const [r0, r1] = range;
	const span = d1 - d0 || 1;
	return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Generate "nice" tick values for an axis. */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
	if (min === max) return [min];
	const rawStep = (max - min) / Math.max(1, targetCount);
	const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const niceStep = ([1, 2, 2.5, 5, 10].find((f) => f * mag >= rawStep) ?? 10) * mag;
	const start = Math.ceil(min / niceStep) * niceStep;
	const ticks: number[] = [];
	for (let t = start; t <= max + niceStep * 1e-9; t += niceStep) {
		ticks.push(Math.round(t / niceStep) * niceStep);
		if (ticks.length > 30) break;
	}
	return ticks;
}

/**
 * Format a unix-seconds timestamp for axis labels in UTC, the same clock as
 * tables and the bottom bar. Adjusts detail based on time span.
 */
export function formatTimestamp(t: number, spanSec: number): string {
	const d = new Date(t * 1000);
	const hours = d.getUTCHours().toString().padStart(2, '0');
	const minutes = d.getUTCMinutes().toString().padStart(2, '0');
	const seconds = d.getUTCSeconds().toString().padStart(2, '0');
	if (spanSec <= 300) return `${hours}:${minutes}:${seconds}`; // HH:MM:SS
	if (spanSec < 86400) return `${hours}:${minutes}`; // HH:MM
	return `${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d
		.getUTCDate()
		.toString()
		.padStart(2, '0')} ${hours}:${minutes}`;
}

/**
 * Split a time-ordered series into contiguous runs so a line is not drawn
 * through periods with no data. A gap is any step longer than `factor` times
 * the series' median sample interval (and longer than `minGap` seconds).
 */
export function splitAtGaps<T extends { timestamp: number }>(
	points: T[],
	factor = 5,
	minGap = 0
): T[][] {
	if (points.length < 3) return points.length ? [points] : [];
	const steps: number[] = [];
	for (let i = 1; i < points.length; i++) {
		const dt = points[i].timestamp - points[i - 1].timestamp;
		if (dt > 0) steps.push(dt);
	}
	if (steps.length === 0) return [points];
	steps.sort((a, b) => a - b);
	const median = steps[Math.floor(steps.length / 2)];
	const threshold = Math.max(median * factor, minGap);
	const runs: T[][] = [[points[0]]];
	for (let i = 1; i < points.length; i++) {
		if (points[i].timestamp - points[i - 1].timestamp > threshold) runs.push([]);
		runs[runs.length - 1].push(points[i]);
	}
	return runs;
}

/** Format a numeric value with fixed precision, returning '—' for non-finite. */
export function formatValue(v: number, precision = 2): string {
	if (!isFinite(v)) return '—';
	// Avoid -0
	if (v === 0) return (0).toFixed(precision);
	return v.toFixed(precision);
}

/** Short SI-prefix form for large numbers. */
export function formatShort(v: number): string {
	if (!isFinite(v)) return '—';
	const abs = Math.abs(v);
	if (abs >= 1e9) return (v / 1e9).toFixed(1) + 'G';
	if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
	if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'k';
	if (abs < 0.01 && abs > 0) return v.toExponential(2);
	return v.toPrecision(4).replace(/\.?0+$/, '');
}

/**
 * Generate an SVG path `d` attribute for a line series.
 * Points should already be in screen coordinates.
 */
export function buildLinePath(
	points: { x: number; y: number }[],
	mode: 'linear' | 'step' | 'smooth' | 'basis' = 'linear'
): string {
	if (points.length === 0) return '';
	if (points.length === 1) return `M${points[0].x},${points[0].y}`;

	switch (mode) {
		case 'step':
			return points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `H${p.x}V${p.y}`)).join('');

		case 'smooth':
		case 'basis': {
			// Catmull-Rom cubic spline
			const d: string[] = [`M${points[0].x},${points[0].y}`];
			for (let i = 0; i < points.length - 1; i++) {
				const p0 = i > 0 ? points[i - 1] : points[i];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = i < points.length - 2 ? points[i + 2] : p2;
				const cp1x = p1.x + (p2.x - p0.x) / 6;
				const cp1y = p1.y + (p2.y - p0.y) / 6;
				const cp2x = p2.x - (p3.x - p1.x) / 6;
				const cp2y = p2.y - (p3.y - p1.y) / 6;
				d.push(`C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`);
			}
			return d.join('');
		}

		default:
			return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join('');
	}
}

export interface RegressionResult {
	slope: number;
	intercept: number;
	r2: number;
	/** Pearson correlation coefficient (sqrt of r2, signed). */
	r: number;
}

/** Ordinary least-squares linear regression: y = slope * x + intercept. */
export function linearRegression(data: { x: number; y: number }[]): RegressionResult {
	const n = data.length;
	if (n < 2) return { slope: 0, intercept: data[0]?.y ?? 0, r2: 0, r: 0 };

	let sx = 0,
		sy = 0,
		sxy = 0,
		sx2 = 0,
		sy2 = 0;
	for (const { x, y } of data) {
		sx += x;
		sy += y;
		sxy += x * y;
		sx2 += x * x;
		sy2 += y * y;
	}
	const mx = sx / n,
		my = sy / n;
	const ssxx = sx2 - n * mx * mx;
	const ssxy = sxy - n * mx * my;
	const ssyy = sy2 - n * my * my;

	if (ssxx === 0) return { slope: 0, intercept: my, r2: 0, r: 0 };

	const slope = ssxy / ssxx;
	const intercept = my - slope * mx;
	const r2 = ssxx && ssyy ? Math.max(0, Math.min(1, (ssxy * ssxy) / (ssxx * ssyy))) : 0;
	const r = Math.sign(ssxy) * Math.sqrt(r2);
	return { slope, intercept, r2, r };
}

/** Find the index of the nearest point to a target x value (binary search). */
export function nearestByX(series: { timestamp: number }[], targetX: number): number {
	if (series.length === 0) return -1;
	let lo = 0,
		hi = series.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (series[mid].timestamp < targetX) lo = mid + 1;
		else hi = mid;
	}
	// Check lo-1 too
	if (
		lo > 0 &&
		Math.abs(series[lo - 1].timestamp - targetX) <= Math.abs(series[lo].timestamp - targetX)
	) {
		return lo - 1;
	}
	return lo;
}

/** Find the nearest point in 2-D Euclidean space. */
export function nearestPoint2D(
	points: { sx: number; sy: number }[],
	mx: number,
	my: number
): number {
	let best = -1;
	let bestDist = Infinity;
	for (let i = 0; i < points.length; i++) {
		const dx = points[i].sx - mx;
		const dy = points[i].sy - my;
		const d = dx * dx + dy * dy;
		if (d < bestDist) {
			bestDist = d;
			best = i;
		}
	}
	return best;
}

/** Generate an arc path for a dial gauge segment. */
export function arcPath(
	cx: number,
	cy: number,
	r: number,
	startAngleDeg: number,
	endAngleDeg: number,
	strokeWidth: number = 0
): string {
	const sr = (startAngleDeg * Math.PI) / 180;
	const er = (endAngleDeg * Math.PI) / 180;
	const large = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
	const sweep = endAngleDeg > startAngleDeg ? 1 : 0;
	const x1 = cx + r * Math.cos(sr);
	const y1 = cy + r * Math.sin(sr);
	const x2 = cx + r * Math.cos(er);
	const y2 = cy + r * Math.sin(er);
	return `M${x1},${y1} A${r},${r},0,${large},${sweep},${x2},${y2}`;
}
