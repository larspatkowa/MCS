<script lang="ts">
	import { userSettings, getEffectiveDateTimeOptions } from '$lib/stores/settings';
	import { currentProject } from '$lib/stores/project';
	import type { ClockZone } from '$lib/objects/types.js';

	let { props } = $props();

	let now = $state(new Date());

	const timezone = $derived((props?.timezone as string)?.trim() || '');
	const showDate = $derived(props?.showDate !== false);
	const use12h = $derived(props?.use12h === true);
	const showMilliseconds = $derived(props?.showMilliseconds === true);
	const displayFormat = $derived((props?.displayFormat as string)?.trim() || 'default');
	const customFormat = $derived((props?.customFormat as string)?.trim() || '');
	const analog = $derived(props?.analog === true);
	const worldClocks = $derived((props?.worldClocks as ClockZone[] | undefined) ?? []);

	// Update interval: faster when showing analog seconds hand or milliseconds
	$effect(() => {
		const interval = analog ? 200 : showMilliseconds ? 100 : 1000;
		const id = setInterval(() => (now = new Date()), interval);
		return () => clearInterval(id);
	});

	const effectiveOptions = $derived(
		getEffectiveDateTimeOptions($userSettings, $currentProject?.settings?.dateTime)
	);

	function pad(n: number, digits: number = 2): string {
		return String(n).padStart(digits, '0');
	}

	const MONTH_SHORT = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const MONTH_LONG = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	function getDateInTimezone(
		date: Date,
		tz: string | undefined
	): {
		year: number;
		month: number;
		day: number;
		hour: number;
		minute: number;
		second: number;
		ms: number;
		dayOfWeek: number;
		hour12: number;
		ampm: string;
	} {
		if (tz) {
			try {
				const parts = new Intl.DateTimeFormat('en-US', {
					timeZone: tz,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hour12: false,
					fractionalSecondDigits: 3
				}).formatToParts(date);
				const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
				const h = Number(get('hour'));
				return {
					year: Number(get('year')),
					month: Number(get('month')),
					day: Number(get('day')),
					hour: h === 24 ? 0 : h,
					minute: Number(get('minute')),
					second: Number(get('second')),
					ms: Number(get('fractionalSecond') || '0'),
					dayOfWeek: date.getDay(),
					hour12: h % 12 || 12,
					ampm: h < 12 ? 'AM' : 'PM'
				};
			} catch {
				/* fallback to local */
			}
		}
		const h = date.getHours();
		return {
			year: date.getFullYear(),
			month: date.getMonth() + 1,
			day: date.getDate(),
			hour: h,
			minute: date.getMinutes(),
			second: date.getSeconds(),
			ms: date.getMilliseconds(),
			dayOfWeek: date.getDay(),
			hour12: h % 12 || 12,
			ampm: h < 12 ? 'AM' : 'PM'
		};
	}

	function applyCustomFormat(template: string, d: ReturnType<typeof getDateInTimezone>): string {
		return template
			.replace(/YYYY/g, String(d.year))
			.replace(/YY/g, String(d.year).slice(-2))
			.replace(/MMMM/g, MONTH_LONG[d.month - 1] ?? '')
			.replace(/MMM/g, MONTH_SHORT[d.month - 1] ?? '')
			.replace(/MM/g, pad(d.month))
			.replace(/M(?!o|a)/g, String(d.month))
			.replace(/DD/g, pad(d.day))
			.replace(/D(?!e|a)/g, String(d.day))
			.replace(/dddd/g, DAY_LONG[d.dayOfWeek] ?? '')
			.replace(/ddd/g, DAY_SHORT[d.dayOfWeek] ?? '')
			.replace(/HH/g, pad(d.hour))
			.replace(/H(?!o)/g, String(d.hour))
			.replace(/hh/g, pad(d.hour12))
			.replace(/h(?!o)/g, String(d.hour12))
			.replace(/mm/g, pad(d.minute))
			.replace(/ss/g, pad(d.second))
			.replace(/SSS/g, pad(d.ms, 3))
			.replace(/SS/g, pad(Math.floor(d.ms / 10)))
			.replace(/S(?!e|u|a)/g, String(Math.floor(d.ms / 100)))
			.replace(/A/g, d.ampm)
			.replace(/a/g, d.ampm.toLowerCase());
	}

	function formatTime(date: Date, tz: string | undefined): string {
		const d = getDateInTimezone(date, tz);
		const msStr = showMilliseconds ? `.${pad(d.ms, 3)}` : '';

		if (displayFormat === 'custom' && customFormat) {
			return applyCustomFormat(customFormat, d);
		}

		switch (displayFormat) {
			case 'short-date':
				return `${MONTH_SHORT[d.month - 1]} ${d.day}, ${d.year}`;
			case 'long-date':
				return `${MONTH_LONG[d.month - 1]} ${d.day}, ${d.year}`;
			case 'full':
				return `${MONTH_LONG[d.month - 1]} ${d.day}, ${d.year} ${pad(use12h ? d.hour12 : d.hour)}:${pad(d.minute)}:${pad(d.second)}${msStr}${use12h ? ' ' + d.ampm : ''}`;
			case 'iso':
				return date.toISOString();
			case 'time-only':
				return `${pad(use12h ? d.hour12 : d.hour)}:${pad(d.minute)}:${pad(d.second)}${msStr}${use12h ? ' ' + d.ampm : ''}`;
			case 'date-only':
				return `${d.month}/${d.day}/${d.year}`;
			case 'mission': {
				const midnight = new Date(date);
				midnight.setHours(0, 0, 0, 0);
				const elapsed = Math.floor((date.getTime() - midnight.getTime()) / 1000);
				const h = Math.floor(elapsed / 3600);
				const m = Math.floor((elapsed % 3600) / 60);
				const s = elapsed % 60;
				return `T+${pad(h)}:${pad(m)}:${pad(s)}`;
			}
			default: {
				if (showDate) {
					const dateStr = new Intl.DateTimeFormat(undefined, {
						year: 'numeric',
						month: 'numeric',
						day: 'numeric',
						timeZone: tz
					}).format(date);
					const timeStr = `${pad(use12h ? d.hour12 : d.hour)}:${pad(d.minute)}:${pad(d.second)}${msStr}${use12h ? ' ' + d.ampm : ''}`;
					return `${dateStr} ${timeStr}`;
				}
				return `${pad(use12h ? d.hour12 : d.hour)}:${pad(d.minute)}:${pad(d.second)}${msStr}${use12h ? ' ' + d.ampm : ''}`;
			}
		}
	}

	const formatted = $derived(formatTime(now, timezone || undefined));

	/** Analog clock angles */
	const analogData = $derived.by(() => {
		const d = getDateInTimezone(now, timezone || undefined);
		const secFrac = d.second + d.ms / 1000;
		const minFrac = d.minute + secFrac / 60;
		const hourFrac = (d.hour % 12) + minFrac / 60;
		return {
			hourDeg: hourFrac * 30, // 360/12
			minDeg: minFrac * 6, // 360/60
			secDeg: secFrac * 6, // 360/60
			d
		};
	});

	/** For world clocks, compute a short time string + hand angles per zone */
	function worldClockTime(date: Date, tz: string) {
		const d = getDateInTimezone(date, tz || undefined);
		const time = `${pad(use12h ? d.hour12 : d.hour)}:${pad(d.minute)}:${pad(d.second)}${use12h ? ' ' + d.ampm : ''}`;
		const secFrac = d.second + d.ms / 1000;
		const minFrac = d.minute + secFrac / 60;
		const hourFrac = (d.hour % 12) + minFrac / 60;
		return { time, d, secFrac, minFrac, hourFrac };
	}

	const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
</script>

{#if worldClocks.length > 0}
	<!-- World clocks mode: row of clocks with labels -->
	<div class="world-clocks">
		{#each worldClocks as wc}
			{@const wt = worldClockTime(now, wc.timezone)}
			<div class="world-clock-card">
				{#if analog}
					<svg viewBox="0 0 100 100" class="mini-analog">
						<!-- Face -->
						<circle
							cx="50"
							cy="50"
							r="46"
							fill="none"
							stroke="var(--mcs-border)"
							stroke-width="1.5"
						/>
						<!-- Hour markers -->
						{#each Array(12) as _, i}
							{@const a = i * 30}
							<line
								x1={50 + 38 * Math.sin((a * Math.PI) / 180)}
								y1={50 - 38 * Math.cos((a * Math.PI) / 180)}
								x2={50 + 42 * Math.sin((a * Math.PI) / 180)}
								y2={50 - 42 * Math.cos((a * Math.PI) / 180)}
								stroke="var(--mcs-text)"
								stroke-width={i % 3 === 0 ? '2' : '1'}
								stroke-linecap="round"
								opacity={i % 3 === 0 ? 0.8 : 0.35}
							/>
						{/each}
						<!-- Hour hand -->
						<line
							x1="50"
							y1="50"
							x2={50 + 22 * Math.sin((wt.hourFrac * 30 * Math.PI) / 180)}
							y2={50 - 22 * Math.cos((wt.hourFrac * 30 * Math.PI) / 180)}
							stroke="var(--mcs-text)"
							stroke-width="2.5"
							stroke-linecap="round"
						/>
						<!-- Minute hand -->
						<line
							x1="50"
							y1="50"
							x2={50 + 32 * Math.sin((wt.minFrac * 6 * Math.PI) / 180)}
							y2={50 - 32 * Math.cos((wt.minFrac * 6 * Math.PI) / 180)}
							stroke="var(--mcs-text)"
							stroke-width="1.5"
							stroke-linecap="round"
						/>
						<!-- Second hand -->
						<line
							x1="50"
							y1="52"
							x2={50 + 36 * Math.sin((wt.secFrac * 6 * Math.PI) / 180)}
							y2={50 - 36 * Math.cos((wt.secFrac * 6 * Math.PI) / 180)}
							stroke="var(--mcs-accent)"
							stroke-width="0.8"
							stroke-linecap="round"
						/>
						<circle cx="50" cy="50" r="2" fill="var(--mcs-accent)" />
					</svg>
				{/if}
				<span class="wc-time">{wt.time}</span>
				<span class="wc-label">{wc.label || wc.timezone}</span>
			</div>
		{/each}
	</div>
{:else if analog}
	<!-- Analog clock mode: full SVG clock face -->
	<div class="analog-root">
		<svg viewBox="0 0 200 200" class="analog-svg">
			<!-- Outer ring -->
			<circle cx="100" cy="100" r="94" fill="none" stroke="var(--mcs-border)" stroke-width="1.5" />
			<!-- Minute ticks -->
			{#each Array(60) as _, i}
				{@const a = i * 6}
				{@const isMajor = i % 5 === 0}
				<line
					x1={100 + (isMajor ? 78 : 83) * Math.sin((a * Math.PI) / 180)}
					y1={100 - (isMajor ? 78 : 83) * Math.cos((a * Math.PI) / 180)}
					x2={100 + 88 * Math.sin((a * Math.PI) / 180)}
					y2={100 - 88 * Math.cos((a * Math.PI) / 180)}
					stroke="var(--mcs-text)"
					stroke-width={isMajor ? '2' : '0.7'}
					stroke-linecap="round"
					opacity={isMajor ? 0.85 : 0.3}
				/>
			{/each}
			<!-- Hour numbers -->
			{#each HOUR_LABELS as num, i}
				{@const a = i * 30}
				<text
					x={100 + 68 * Math.sin((a * Math.PI) / 180)}
					y={100 - 68 * Math.cos((a * Math.PI) / 180)}
					text-anchor="middle"
					dominant-baseline="central"
					fill="var(--mcs-text)"
					font-size="12"
					font-weight="600"
					font-family="var(--mcs-font-sans)"
					opacity="0.8">{num}</text
				>
			{/each}
			<!-- Hour hand -->
			<line
				x1="100"
				y1="100"
				x2={100 + 48 * Math.sin((analogData.hourDeg * Math.PI) / 180)}
				y2={100 - 48 * Math.cos((analogData.hourDeg * Math.PI) / 180)}
				stroke="var(--mcs-text)"
				stroke-width="4"
				stroke-linecap="round"
			/>
			<!-- Minute hand -->
			<line
				x1="100"
				y1="100"
				x2={100 + 68 * Math.sin((analogData.minDeg * Math.PI) / 180)}
				y2={100 - 68 * Math.cos((analogData.minDeg * Math.PI) / 180)}
				stroke="var(--mcs-text)"
				stroke-width="2.5"
				stroke-linecap="round"
			/>
			<!-- Second hand -->
			<line
				x1={100 - 12 * Math.sin((analogData.secDeg * Math.PI) / 180)}
				y1={100 + 12 * Math.cos((analogData.secDeg * Math.PI) / 180)}
				x2={100 + 76 * Math.sin((analogData.secDeg * Math.PI) / 180)}
				y2={100 - 76 * Math.cos((analogData.secDeg * Math.PI) / 180)}
				stroke="var(--mcs-accent)"
				stroke-width="1"
				stroke-linecap="round"
			/>
			<!-- Center cap -->
			<circle cx="100" cy="100" r="4" fill="var(--mcs-accent)" />
			<circle cx="100" cy="100" r="2" fill="var(--mcs-bg)" />
		</svg>
		<div class="analog-digital">
			<span class="clock-value-sm">{formatted}</span>
			{#if timezone}
				<span class="clock-tz">{timezone}</span>
			{/if}
		</div>
	</div>
{:else}
	<!-- Digital clock mode (original) -->
	<div class="clock-view">
		<span class="clock-value">{formatted}</span>
		{#if timezone}
			<span class="clock-tz">{timezone}</span>
		{/if}
	</div>
{/if}

<style>
	/* Digital clock */
	.clock-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 0;
		padding: 0.5rem;
		height: 100%;
		container-type: inline-size;
		overflow: hidden;
	}
	.clock-value {
		font-family: var(--mcs-font-mono);
		font-size: clamp(1rem, 5cqw, 2.9rem);
		font-variant-numeric: tabular-nums;
		color: var(--mcs-text);
		letter-spacing: 0.01em;
	}
	.clock-tz {
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
	}

	/* Analog clock */
	.analog-root {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: 6px;
		padding: 12px;
	}
	.analog-svg {
		width: min(100%, 240px);
		height: auto;
		flex-shrink: 1;
		min-height: 0;
		max-height: calc(100% - 36px);
	}
	.analog-digital {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.clock-value-sm {
		font-family: var(--mcs-font-mono);
		font-size: 0.95rem;
		font-variant-numeric: tabular-nums;
		color: var(--mcs-text);
		letter-spacing: 0.01em;
	}

	/* World clocks */
	.world-clocks {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: center;
		gap: 8px;
		padding: 8px;
		height: 100%;
		align-content: center;
		container-type: inline-size;
		overflow: hidden;
	}
	.world-clock-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-width: 56px;
		flex: 0 1 auto;
	}
	.mini-analog {
		width: clamp(48px, 10cqw, 72px);
		height: clamp(48px, 10cqw, 72px);
	}
	.wc-time {
		font-family: var(--mcs-font-mono);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
		color: var(--mcs-text);
	}
	.wc-label {
		font-size: 0.65rem;
		color: var(--mcs-text-muted);
		text-align: center;
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
