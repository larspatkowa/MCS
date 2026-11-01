export type DateFormatId = 'yyyy/m/d' | 'short' | 'iso';
export type TimeFormatId = '24h' | '12h';

export interface DateTimeFormatOptions {
	dateFormat: DateFormatId;
	timeFormat: TimeFormatId;
	/** Render in UTC instead of the browser's local zone. Telemetry time uses UTC. */
	utc?: boolean;
}

const DEFAULT_OPTIONS: DateTimeFormatOptions = {
	dateFormat: 'yyyy/m/d',
	timeFormat: '24h'
};

export const DEFAULT_DATE_TIME_OPTIONS = DEFAULT_OPTIONS;

function formatDatePart(date: Date, format: DateFormatId, utc: boolean, locale?: string): string {
	if (format === 'short') {
		return new Intl.DateTimeFormat(locale, {
			dateStyle: 'short',
			timeZone: utc ? 'UTC' : undefined
		}).format(date);
	}
	const y = utc ? date.getUTCFullYear() : date.getFullYear();
	const m = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
	const d = utc ? date.getUTCDate() : date.getDate();
	if (format === 'iso') {
		return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}
	// yyyy/m/d - no leading zeros on month/day
	return `${y}/${m}/${d}`;
}

function formatTimePart(date: Date, format: TimeFormatId, utc: boolean, locale?: string): string {
	const hour12 = format === '12h';
	const formatter = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12,
		timeZone: utc ? 'UTC' : undefined
	});
	return formatter.format(date);
}

function formatTimeHHmmPart(date: Date, format: TimeFormatId, locale?: string): string {
	// "1539" for 15:39 in 24h mode (and "0339" for 3:39 in 12h mode).
	const hour12 = format === '12h';
	const parts = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		hour12
	}).formatToParts(date);
	const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
	const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
	return `${hour}${minute}`;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * Compact timestamp for grids/lists.
 * - today: HHmm (24h) / hhmm (12h), no separators
 * - otherwise: locale short date
 */
export function formatCompactDateTime(
	date: Date,
	now: Date,
	options: Partial<DateTimeFormatOptions> = {},
	locale?: string
): string {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	if (isSameLocalDay(date, now)) {
		return formatTimeHHmmPart(date, opts.timeFormat, locale);
	}
	return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date);
}

/**
 * Format a date for display in the bottom bar (date + time).
 */
export function formatDateTime(
	date: Date,
	options: Partial<DateTimeFormatOptions> = {},
	locale?: string
): string {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const utc = opts.utc === true;
	const dateStr = formatDatePart(date, opts.dateFormat, utc, locale);
	const timeStr = formatTimePart(date, opts.timeFormat, utc, locale);
	return utc ? `${dateStr} ${timeStr} UTC` : `${dateStr} ${timeStr}`;
}
