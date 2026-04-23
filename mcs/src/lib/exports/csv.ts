/**
 * CSV / data export utilities for MCS objects.
 *
 * Provides functions to export chart and table data to CSV format,
 * downloading as a file in the browser.
 */

/** Escape a CSV cell value, quoting if needed */
function csvCell(value: unknown): string {
	const s = String(value ?? '');
	if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

/** Convert rows (array of objects) to a CSV string */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) return '';
	const headers = Object.keys(rows[0]!);
	const lines = [headers.map(csvCell).join(',')];
	for (const row of rows) {
		lines.push(headers.map((h) => csvCell(row[h])).join(','));
	}
	return lines.join('\n');
}

/** Download a string as a file */
export function downloadFile(content: string, filename: string, mimeType: string) {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

/** Download data as CSV */
export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
	const csv = rowsToCsv(rows);
	downloadFile(csv, filename, 'text/csv;charset=utf-8');
}

/**
 * Build exportable rows from a telemetry-style data source.
 * Accepts an array of stream data (from fetchStreamData) and
 * produces flat rows with timestamp, streamId, and value columns.
 */
export function streamDataToRows(
	streamData: Array<{
		streamId: string;
		data: Array<{ timestamp: number | string; value: number | string; [k: string]: unknown }>;
	}>
): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (const stream of streamData) {
		for (const point of stream.data) {
			rows.push({
				streamId: stream.streamId,
				timestamp: point.timestamp,
				time: new Date(Number(point.timestamp) * 1000).toISOString(),
				value: point.value
			});
		}
	}
	rows.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
	return rows;
}

/**
 * Build exportable rows from chart series data (LinePlot, OverlayPlot, etc.)
 */
export function seriesToRows(
	series: Array<{ name: string; data: Array<{ x: Date | number; y: number }> }>
): Record<string, unknown>[] {
	const rows: Record<string, unknown>[] = [];
	for (const s of series) {
		for (const point of s.data) {
			const ts = point.x instanceof Date ? point.x : new Date(Number(point.x));
			rows.push({
				series: s.name,
				timestamp: ts.toISOString(),
				value: point.y
			});
		}
	}
	return rows;
}
