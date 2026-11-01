<script lang="ts">
	import type { EventLogProps } from '$lib/objects/types.js';
	import { currentProject } from '$lib/stores/project.js';
	import { subscribeSSE } from '$lib/sse-manager.js';

	let { props } = $props<{ objectId: string; props: EventLogProps }>();

	type Entry =
		| {
				kind: 'limit';
				id: string;
				ts: number;
				label: string;
				severity: 'yellow' | 'red';
				ackedAt: string | null;
		  }
		| { kind: 'note'; id: string; ts: number; label: string; details: string };

	let limitEntries = $state<Entry[]>([]);
	let noteEntries = $state<Entry[]>([]);
	let loadError = $state('');
	let unackedOnly = $state(false);
	let draft = $state('');
	let posting = $state(false);

	const lookbackSeconds = $derived((props.lookbackHours ?? 24) * 3600);
	const showNotes = $derived(props.showNotes !== false);

	const entries = $derived(
		[...limitEntries, ...(showNotes ? noteEntries : [])]
			.filter((entry) => !unackedOnly || (entry.kind === 'limit' && !entry.ackedAt))
			.sort((a, b) => b.ts - a.ts)
	);
	const unackedCount = $derived(
		limitEntries.filter((entry) => entry.kind === 'limit' && !entry.ackedAt).length
	);

	async function load(projectId: string, signal?: AbortSignal) {
		const to = Date.now() / 1000 + 60;
		const from = to - lookbackSeconds;
		try {
			const [limitResponse, noteResponse] = await Promise.all([
				fetch(`/api/projects/${projectId}/limit-events?from=${from}&to=${to}`, { signal }),
				fetch(`/api/projects/${projectId}/annotations?from=${from}&to=${to}&limit=2000`, {
					signal
				})
			]);
			if (!limitResponse.ok || !noteResponse.ok) throw new Error('Event request failed');
			const limits = (await limitResponse.json()) as {
				id: string;
				ts: number;
				label: string;
				severity: 'yellow' | 'red';
				ackedAt: string | null;
			}[];
			const notes = (await noteResponse.json()) as {
				id: string;
				ts: number;
				label: string;
				details: string;
			}[];
			limitEntries = limits.map((event) => ({ kind: 'limit' as const, ...event }));
			noteEntries = notes.map((note) => ({ kind: 'note' as const, ...note }));
			loadError = '';
		} catch (error) {
			if (!signal?.aborted) loadError = (error as Error).message;
		}
	}

	$effect(() => {
		const projectId = $currentProject?.id;
		lookbackSeconds;
		if (!projectId) return;
		const controller = new AbortController();
		void load(projectId, controller.signal);
		const timer = setInterval(() => void load(projectId, controller.signal), 10_000);
		const unsubscribe = subscribeSSE(projectId, '*', (event) => {
			if (!('type' in event) || event.type !== 'limit') return;
			const limit = event.event;
			if (limitEntries.some((entry) => entry.id === limit.id)) return;
			limitEntries = [
				{
					kind: 'limit',
					id: limit.id,
					ts: limit.ts,
					label: limit.label,
					severity: limit.severity,
					ackedAt: limit.ackedAt
				},
				...limitEntries
			];
		});
		return () => {
			controller.abort();
			clearInterval(timer);
			unsubscribe();
		};
	});

	async function acknowledge(id: string) {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		const response = await fetch(`/api/projects/${projectId}/limit-events/${id}`, {
			method: 'PATCH'
		});
		if (response.ok) {
			limitEntries = limitEntries.map((entry) =>
				entry.id === id && entry.kind === 'limit'
					? { ...entry, ackedAt: new Date().toISOString() }
					: entry
			);
		}
	}

	async function acknowledgeAll() {
		const projectId = $currentProject?.id;
		if (!projectId) return;
		const response = await fetch(`/api/projects/${projectId}/limit-events?action=ack-all`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		if (response.ok) await load(projectId);
	}

	async function addNote(event: SubmitEvent) {
		event.preventDefault();
		const projectId = $currentProject?.id;
		const label = draft.trim();
		if (!projectId || !label) return;
		posting = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/annotations`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ts: Date.now() / 1000, label })
			});
			if (response.ok) {
				draft = '';
				await load(projectId);
			} else loadError = `Could not save the note (${response.status})`;
		} finally {
			posting = false;
		}
	}

	function utc(ts: number): string {
		const iso = new Date(ts * 1000).toISOString();
		return `${iso.slice(5, 10)} ${iso.slice(11, 19)}`;
	}
</script>

<div class="log-root">
	<div class="toolbar">
		<span class="count" aria-live="polite">
			{unackedCount === 0 ? 'No unacknowledged alarms' : `${unackedCount} unacknowledged`}
		</span>
		<label class="filter">
			<input type="checkbox" bind:checked={unackedOnly} />
			Unacknowledged only
		</label>
		{#if unackedCount > 0}
			<button type="button" class="small" onclick={acknowledgeAll}>Acknowledge all</button>
		{/if}
	</div>

	<ol class="entries">
		{#each entries as entry (entry.kind + entry.id)}
			<li class="entry {entry.kind === 'limit' ? entry.severity : 'note'}">
				<time datetime={new Date(entry.ts * 1000).toISOString()}>{utc(entry.ts)}</time>
				{#if entry.kind === 'limit'}
					<span class="tag">{entry.severity === 'red' ? 'CRIT' : 'WARN'}</span>
					<span class="text">{entry.label}</span>
					{#if entry.ackedAt}
						<span class="acked">Acknowledged</span>
					{:else}
						<button type="button" class="small" onclick={() => acknowledge(entry.id)}>
							Acknowledge
						</button>
					{/if}
				{:else}
					<span class="tag note-tag">NOTE</span>
					<span class="text">{entry.label}</span>
				{/if}
			</li>
		{:else}
			<li class="empty">
				{unackedOnly ? 'Nothing waiting for acknowledgement.' : 'No alarms or notes yet.'}
			</li>
		{/each}
	</ol>

	{#if loadError}<p class="error" role="status">{loadError}</p>{/if}

	{#if showNotes}
		<form class="note-form" onsubmit={addNote}>
			<label class="sr-only" for="note-input">Log a note</label>
			<input
				id="note-input"
				type="text"
				placeholder="Log a note at the current time"
				maxlength="500"
				bind:value={draft}
			/>
			<button type="submit" disabled={posting || !draft.trim()}>Log</button>
		</form>
	{/if}
</div>

<style>
	.log-root {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		font-family: var(--mcs-font-sans);
		font-size: 12px;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 4px 10px;
		border-bottom: 1px solid var(--mcs-border);
		color: var(--mcs-text-muted);
		font-size: 11px;
	}
	.count {
		color: var(--mcs-text);
		font-weight: 500;
	}
	.filter {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: auto;
		cursor: pointer;
	}
	.entries {
		flex: 1;
		overflow: auto;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.entry {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 5px 10px;
		border-bottom: 1px solid color-mix(in srgb, var(--mcs-border) 50%, transparent);
	}
	time {
		flex-shrink: 0;
		font-family: var(--mcs-font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--mcs-text-muted);
		font-size: 11px;
	}
	.tag {
		flex-shrink: 0;
		padding: 0 4px;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.05em;
	}
	.entry.red .tag {
		color: var(--mcs-danger);
	}
	.entry.yellow .tag {
		color: var(--mcs-warning);
	}
	.note-tag {
		color: var(--mcs-text-muted);
	}
	.text {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--mcs-text);
		font-family: var(--mcs-font-mono);
	}
	.entry.note .text {
		font-family: var(--mcs-font-sans);
	}
	.acked {
		color: var(--mcs-text-muted);
		font-size: 11px;
	}
	.empty {
		padding: 1.5rem 1rem;
		color: var(--mcs-text-muted);
		text-align: center;
	}
	button {
		height: var(--mcs-control-height-sm);
		padding: 0 0.7rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface);
		color: var(--mcs-text);
		font: inherit;
		cursor: pointer;
	}
	button.small {
		height: auto;
		padding: 1px 6px;
		font-size: 11px;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--mcs-focus-ring, var(--mcs-accent));
		outline-offset: 2px;
	}
	.note-form {
		display: flex;
		gap: 0.4rem;
		padding: 6px 10px;
		border-top: 1px solid var(--mcs-border);
	}
	.note-form input {
		flex: 1;
		min-width: 0;
		height: var(--mcs-control-height-sm);
		padding: 0 0.5rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-bg);
		color: var(--mcs-text);
		font: inherit;
	}
	.error {
		margin: 0;
		padding: 4px 10px;
		color: var(--mcs-danger);
		font-size: 11px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
