import { writable } from 'svelte/store';
import type { DateFormatId, TimeFormatId } from '$lib/date-time-format';
import { DEFAULT_DATE_TIME_OPTIONS } from '$lib/date-time-format';

export interface UserDateTimeSettings {
	dateFormat: DateFormatId;
	timeFormat: TimeFormatId;
}

const STORAGE_KEY = 'mcs-settings';

function parseStored(value: string | null): UserDateTimeSettings | null {
	if (!value) return null;
	try {
		const data = JSON.parse(value) as Partial<UserDateTimeSettings>;
		const dateFormat = data.dateFormat ?? DEFAULT_DATE_TIME_OPTIONS.dateFormat;
		const timeFormat = data.timeFormat ?? DEFAULT_DATE_TIME_OPTIONS.timeFormat;
		if (
			(dateFormat !== 'yyyy/m/d' && dateFormat !== 'short' && dateFormat !== 'iso') ||
			(timeFormat !== '24h' && timeFormat !== '12h')
		) {
			return null;
		}
		return { dateFormat, timeFormat };
	} catch {
		return null;
	}
}

function loadUserSettings(): UserDateTimeSettings {
	if (typeof window === 'undefined') return { ...DEFAULT_DATE_TIME_OPTIONS };
	const stored = localStorage.getItem(STORAGE_KEY);
	const parsed = parseStored(stored);
	return parsed ?? { ...DEFAULT_DATE_TIME_OPTIONS };
}

export const userSettings = writable<UserDateTimeSettings>(loadUserSettings());

export const settingsModalOpen = writable<boolean>(false);

/** When true, the Add Object modal (in sidebar) should open. Cleared when modal closes. */
export const addObjectModalOpen = writable<boolean>(false);

userSettings.subscribe((value) => {
	if (typeof window !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	}
});

export interface ProjectDateTimeSettings {
	dateFormat?: DateFormatId | string;
	timeFormat?: TimeFormatId | string;
}

const VALID_DATE_FORMATS: DateFormatId[] = ['yyyy/m/d', 'short', 'iso'];
const VALID_TIME_FORMATS: TimeFormatId[] = ['24h', '12h'];

function isValidDateFormat(v: unknown): v is DateFormatId {
	return typeof v === 'string' && VALID_DATE_FORMATS.includes(v as DateFormatId);
}
function isValidTimeFormat(v: unknown): v is TimeFormatId {
	return typeof v === 'string' && VALID_TIME_FORMATS.includes(v as TimeFormatId);
}

/**
 * Resolve effective date/time format: project overrides (if any) > user settings > default.
 */
export function getEffectiveDateTimeOptions(
	user: UserDateTimeSettings,
	projectDateTime?: ProjectDateTimeSettings | null
): UserDateTimeSettings {
	if (!projectDateTime) return user;
	return {
		dateFormat:
			projectDateTime.dateFormat != null && isValidDateFormat(projectDateTime.dateFormat)
				? projectDateTime.dateFormat
				: user.dateFormat,
		timeFormat:
			projectDateTime.timeFormat != null && isValidTimeFormat(projectDateTime.timeFormat)
				? projectDateTime.timeFormat
				: user.timeFormat
	};
}
