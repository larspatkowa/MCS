<script lang="ts">
	import type { MissionClockProps } from '$lib/objects/types.js';
	import { currentProject } from '$lib/stores/project.js';

	let { objectId, props } = $props<{ objectId: string; props: MissionClockProps }>();

	// Count state lives in the object so every operator sees the same T-0.
	// Hold freezes the count by storing the remaining seconds instead of T-0.
	let t0 = $state<number | null>(null);
	let heldAt = $state<number | null>(null);
	let saveError = $state('');
	$effect(() => {
		t0 = props.t0 ?? null;
		heldAt = props.heldSeconds ?? null;
	});

	let now = $state(Date.now() / 1000);
	$effect(() => {
		let frame = 0;
		const tick = () => {
			now = Date.now() / 1000;
			frame = requestAnimationFrame(tick);
		};
		// Animation frames pause in background tabs; the interval keeps the
		// clock correct when the tab returns.
		const timer = setInterval(() => (now = Date.now() / 1000), 250);
		frame = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(frame);
			clearInterval(timer);
		};
	});

	// Follow changes made by other operators.
	$effect(() => {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		const timer = setInterval(async () => {
			if (saving) return;
			try {
				const response = await fetch(`/api/projects/${projectId}/objects/${objectId}`);
				if (!response.ok) return;
				const object = (await response.json()) as { props?: MissionClockProps };
				t0 = object.props?.t0 ?? null;
				heldAt = object.props?.heldSeconds ?? null;
			} catch {
				// Keep the local count when the server is briefly unreachable.
			}
		}, 3000);
		return () => clearInterval(timer);
	});

	let saving = false;
	async function save(next: { t0: number | null; heldSeconds: number | null }) {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		t0 = next.t0;
		heldAt = next.heldSeconds;
		saving = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/objects/${objectId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ props: { ...props, ...next } })
			});
			saveError = response.ok ? '' : `Could not save the clock (${response.status})`;
		} catch {
			saveError = 'Could not save the clock';
		} finally {
			saving = false;
		}
	}

	/** Seconds relative to T-0: negative before launch, positive after. */
	const relative = $derived(heldAt !== null ? -heldAt : t0 !== null ? now - t0 : null);

	function formatCount(seconds: number): string {
		const sign = seconds < 0 ? 'T−' : 'T+';
		// Count down in whole seconds that reach zero exactly at T-0.
		const whole = seconds < 0 ? Math.ceil(-seconds) : Math.floor(seconds);
		const h = Math.floor(whole / 3600);
		const m = Math.floor((whole % 3600) / 60);
		const s = whole % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${sign}${h > 0 ? `${pad(h)}:` : ''}${pad(m)}:${pad(s)}`;
	}

	const utcNow = $derived(new Date(now * 1000).toISOString().slice(11, 19));
	const t0Label = $derived(
		t0 === null ? '' : `${new Date(t0 * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC`
	);

	let minutesInput = $state(10);
	function startCount() {
		const seconds = Math.max(1, Math.round(minutesInput * 60));
		void save({ t0: Date.now() / 1000 + seconds, heldSeconds: null });
	}
	function hold() {
		if (relative === null || relative >= 0) return;
		void save({ t0, heldSeconds: -relative });
	}
	function resume() {
		if (heldAt === null) return;
		void save({ t0: Date.now() / 1000 + heldAt, heldSeconds: null });
	}
	function recycle() {
		void save({ t0: null, heldSeconds: null });
	}
	function launchNow() {
		void save({ t0: Date.now() / 1000, heldSeconds: null });
	}
</script>

<div class="clock-root">
	{#if props.label}<p class="label">{props.label}</p>{/if}
	<p
		class="count"
		class:after={relative !== null && relative >= 0}
		class:held={heldAt !== null}
		aria-live="off"
	>
		{relative === null ? 'T−--:--' : formatCount(relative)}
	</p>
	<p class="status">
		{#if heldAt !== null}
			<span class="tag held-tag">HOLD</span>
		{/if}
		<span>UTC {utcNow}</span>
		{#if t0Label && heldAt === null}<span class="sep">·</span><span>T-0 {t0Label}</span>{/if}
	</p>

	{#if props.showControls !== false}
		<div class="controls">
			{#if t0 === null && heldAt === null}
				<label class="minutes">
					<span>Count from</span>
					<input type="number" min="0.1" step="1" bind:value={minutesInput} />
					<span>min</span>
				</label>
				<button type="button" onclick={startCount}>Start count</button>
				<button type="button" onclick={launchNow}>Mark T-0 now</button>
			{:else}
				{#if heldAt !== null}
					<button type="button" onclick={resume}>Resume</button>
				{:else if relative !== null && relative < 0}
					<button type="button" onclick={hold}>Hold</button>
				{/if}
				<button type="button" onclick={recycle}>Recycle</button>
			{/if}
		</div>
	{/if}
	{#if saveError}<p class="error" role="alert">{saveError}</p>{/if}
</div>

<style>
	.clock-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.75rem;
		container-type: size;
		font-family: var(--mcs-font-sans);
	}
	p {
		margin: 0;
	}
	.label {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--mcs-text-muted);
	}
	.count {
		font-family: var(--mcs-font-mono);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: clamp(1.5rem, min(18cqw, 40cqh), 7rem);
		line-height: 1;
		color: var(--mcs-text);
	}
	.count.after {
		color: var(--mcs-success);
	}
	.count.held {
		color: var(--mcs-warning);
	}
	.status {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--mcs-font-mono);
		font-size: 11px;
		color: var(--mcs-text-muted);
	}
	.tag {
		padding: 0 5px;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
	}
	.held-tag {
		color: var(--mcs-warning);
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.minutes {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 12px;
		color: var(--mcs-text-muted);
	}
	.minutes input {
		width: 4.5rem;
		height: var(--mcs-control-height-sm);
		padding: 0 0.4rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-bg);
		color: var(--mcs-text);
		font: inherit;
		font-family: var(--mcs-font-mono);
	}
	button {
		height: var(--mcs-control-height-sm);
		padding: 0 0.7rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	button:hover {
		background: var(--mcs-surface-alt);
	}
	button:focus-visible,
	.minutes input:focus-visible {
		outline: 2px solid var(--mcs-focus-ring, var(--mcs-accent));
		outline-offset: 2px;
	}
	.error {
		font-size: 12px;
		color: var(--mcs-danger);
	}
	@container (max-height: 140px) {
		.controls,
		.status {
			display: none;
		}
	}
</style>
