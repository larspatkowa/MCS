<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import { subscribeSSE } from '$lib/sse-manager.js';
	import { Radio, ArrowUp, ArrowDown, AlertTriangle, Wifi, WifiOff } from '@lucide/svelte';

	let { props } = $props();

	const streamId = $derived((props?.dataSource as string) ?? '');
	const maxMessages = $derived(Math.max(10, Number(props?.maxMessages) || 200));
	const showDirection = $derived(props?.showDirection !== false);
	const showChannel = $derived(props?.showChannel !== false);
	const showCallsign = $derived(props?.showCallsign !== false);
	const filterDirection = $derived((props?.filterDirection as string) ?? 'all');
	const showTimestamp = $derived(props?.showTimestamp !== false);
	const compactMode = $derived(!!props?.compactMode);

	interface CommMessage {
		id: string;
		ts: number;
		message: string;
		channel?: string;
		direction?: 'uplink' | 'downlink' | string;
		callsign?: string;
		frequency?: number;
		snr?: number;
		sequence?: number;
	}

	let messages = $state<CommMessage[]>([]);
	let connected = $state(false);
	let error = $state<string | null>(null);
	let msgCount = $state(0);
	let scrollEl = $state<HTMLElement | null>(null);
	let autoScroll = $state(true);

	function formatTs(ts: number): string {
		const d = new Date(ts * 1000);
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		const ss = String(d.getSeconds()).padStart(2, '0');
		const ms = String(d.getMilliseconds()).padStart(3, '0');
		return `${hh}:${mm}:${ss}.${ms}`;
	}

	function parsePayload(raw: Record<string, unknown>, ts: number): CommMessage {
		return {
			id: `${ts}-${Math.random()}`,
			ts,
			message: String(raw.message ?? raw.text ?? raw.msg ?? ''),
			channel: raw.channel != null ? String(raw.channel) : undefined,
			direction: raw.direction as string | undefined,
			callsign: raw.callsign != null ? String(raw.callsign) : undefined,
			frequency: typeof raw.frequency === 'number' ? raw.frequency : undefined,
			snr: typeof raw.snr === 'number' ? raw.snr : undefined,
			sequence: typeof raw.sequence === 'number' ? raw.sequence : undefined
		};
	}

	function addMessage(msg: CommMessage) {
		if (filterDirection !== 'all' && msg.direction && msg.direction !== filterDirection) return;
		messages = [...messages.slice(-(maxMessages - 1)), msg];
		msgCount++;
		if (autoScroll && scrollEl) {
			setTimeout(() => {
				if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
			}, 0);
		}
	}

	$effect(() => {
		const proj = $currentProject;
		const sid = streamId;
		if (!proj || !sid) {
			messages = [];
			connected = false;
			return;
		}
		const projectId = proj.id;

		// Load recent messages via REST
		fetch(`/api/projects/${projectId}/streams/${encodeURIComponent(sid)}/samples?limit=100`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (!data) return;
				const raw: Array<{ ts?: number; timestamp?: number; payload?: Record<string, unknown> }> =
					Array.isArray(data) ? data : (data.samples ?? []);
				const parsed = raw
					.filter((s) => s.payload?.message || s.payload?.text || s.payload?.msg)
					.map((s) => parsePayload(s.payload ?? {}, s.ts ?? s.timestamp ?? 0));
				messages = parsed.slice(-maxMessages);
				if (autoScroll && scrollEl) {
					setTimeout(() => {
						scrollEl && (scrollEl.scrollTop = scrollEl.scrollHeight);
					}, 50);
				}
			})
			.catch(() => {});

		// Real-time via shared SSE
		connected = true;
		const unsub = subscribeSSE(projectId, sid, (event) => {
			if (!('values' in event) || !event.values) return;
			const msg = parsePayload(
				event.values as Record<string, unknown>,
				event.timestamp ?? Date.now() / 1000
			);
			if (msg.message) addMessage(msg);
		});

		return () => {
			unsub();
			connected = false;
		};
	});

	function directionClass(dir?: string): string {
		if (dir === 'uplink') return 'text-[color:var(--mcs-comms-uplink,#3b82f6)]';
		if (dir === 'downlink') return 'text-[color:var(--mcs-comms-downlink,#22c55e)]';
		return 'text-[color:var(--mcs-text-muted)]';
	}

	function snrClass(snr?: number): string {
		if (snr == null) return '';
		if (snr < 5) return 'text-red-500';
		if (snr < 9) return 'text-yellow-500';
		return 'text-[color:var(--mcs-text-muted)]';
	}
</script>

<div class="comms-log-view" class:compact={compactMode}>
	<!-- Header bar -->
	<div class="comms-header">
		<div class="comms-header-left">
			<Radio size={13} />
			<span class="comms-title">{(props?.label as string) || 'Comms Log'}</span>
			{#if streamId}
				<span class="comms-source">{streamId}</span>
			{/if}
		</div>
		<div class="comms-header-right">
			<span class="comms-count">{msgCount} msgs</span>
			{#if connected}
				<Wifi size={11} class="text-[color:var(--mcs-comms-live,#22c55e)]" />
			{:else}
				<WifiOff size={11} class="text-[color:var(--mcs-text-muted)]" />
			{/if}
		</div>
	</div>

	{#if !streamId}
		<div class="comms-empty">
			<Radio size={24} class="opacity-30" />
			<p>Select a data source in Properties</p>
		</div>
	{:else if messages.length === 0}
		<div class="comms-empty">
			<Radio size={24} class="opacity-30" />
			<p>Waiting for messages…</p>
		</div>
	{:else}
		<div
			class="comms-scroll"
			bind:this={scrollEl}
			onscroll={() => {
				if (!scrollEl) return;
				const atBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 40;
				autoScroll = atBottom;
			}}
		>
			<div class="comms-rows">
				{#each messages as msg (msg.id)}
					<div
						class="comms-row"
						class:uplink={msg.direction === 'uplink'}
						class:downlink={msg.direction === 'downlink'}
					>
						{#if showTimestamp}
							<span class="comms-ts">{formatTs(msg.ts)}</span>
						{/if}
						{#if showDirection && msg.direction}
							<span class="comms-dir {directionClass(msg.direction)}" title={msg.direction}>
								{#if msg.direction === 'uplink'}
									<ArrowUp size={10} />
								{:else if msg.direction === 'downlink'}
									<ArrowDown size={10} />
								{:else}
									↔
								{/if}
							</span>
						{/if}
						{#if showChannel && msg.channel}
							<span class="comms-channel">{msg.channel}</span>
						{/if}
						{#if showCallsign && msg.callsign}
							<span class="comms-callsign">{msg.callsign}</span>
						{/if}
						<span class="comms-message">{msg.message}</span>
						{#if msg.snr != null}
							<span class="comms-snr {snrClass(msg.snr)}" title="SNR">{msg.snr.toFixed(1)} dB</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if !autoScroll}
			<button
				class="comms-scroll-to-bottom"
				onclick={() => {
					autoScroll = true;
					if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
				}}
			>
				↓ Jump to latest
			</button>
		{/if}
	{/if}
</div>

<style>
	.comms-log-view {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--mcs-surface);
		overflow: hidden;
		font-family: var(--mcs-font-mono, monospace);
	}

	.comms-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		flex-shrink: 0;
		gap: 0.5rem;
		min-height: 1.75rem;
	}

	.comms-header-left {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		overflow: hidden;
	}

	.comms-header-right {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}

	.comms-title {
		font-family: var(--mcs-font-sans);
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--mcs-text);
		white-space: nowrap;
	}

	.comms-source {
		font-size: 0.65rem;
		color: var(--mcs-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.comms-count {
		font-size: 0.6rem;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
	}

	.comms-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-sans);
		font-size: 0.8rem;
	}

	.comms-scroll {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		scroll-behavior: smooth;
	}

	.comms-rows {
		display: flex;
		flex-direction: column;
		padding: 0.25rem 0;
	}

	.comms-row {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		padding: 0.15rem 0.5rem;
		font-size: 0.72rem;
		line-height: 1.45;
		border-bottom: 1px solid transparent;
		transition: background 0.1s;
	}

	.comms-row:hover {
		background: var(--mcs-surface-alt);
	}

	.comms-row.uplink {
		border-left: 2px solid var(--mcs-comms-uplink, #3b82f6);
	}

	.comms-row.downlink {
		border-left: 2px solid var(--mcs-comms-downlink, #22c55e);
	}

	.comms-ts {
		color: var(--mcs-text-muted);
		font-size: 0.65rem;
		flex-shrink: 0;
		letter-spacing: -0.01em;
	}

	.comms-dir {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.comms-channel {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--mcs-text-muted);
		background: var(--mcs-surface-alt);
		border-radius: 2px;
		padding: 0 3px;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.comms-callsign {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--mcs-text);
		flex-shrink: 0;
		white-space: nowrap;
	}

	.comms-message {
		flex: 1;
		color: var(--mcs-text);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.comms-snr {
		font-size: 0.6rem;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.comms-scroll-to-bottom {
		position: absolute;
		bottom: 0.5rem;
		right: 0.75rem;
		background: var(--mcs-accent);
		color: var(--mcs-bg);
		border: none;
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		cursor: pointer;
		font-family: var(--mcs-font-sans);
		font-weight: 500;
		opacity: 0.9;
	}

	.comms-scroll-to-bottom:hover {
		opacity: 1;
	}

	/* Compact mode */
	.compact .comms-row {
		padding: 0.08rem 0.5rem;
		font-size: 0.67rem;
	}

	.compact .comms-ts {
		font-size: 0.6rem;
	}
</style>
