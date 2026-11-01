<script lang="ts">
	import { browser } from '$app/environment';
	import { currentProject } from '$lib/stores/project';
	import { userSettings, settingsModalOpen } from '$lib/stores/settings';
	import { propertyPanelMode } from '$lib/stores/property-panel';
	import { explorerTree, refreshExplorerTree } from '$lib/stores/explorerTree';
	import type { DateFormatId, TimeFormatId } from '$lib/date-time-format';
	import { X } from '@lucide/svelte';

	type TabId = 'global' | 'project' | 'streams';
	type StreamInfo = {
		id: string;
		name: string;
		metadata?: { unit?: string; min?: number; max?: number; [key: string]: unknown };
	};

	const DATE_OPTIONS: { value: DateFormatId; label: string }[] = [
		{ value: 'yyyy/m/d', label: '2026/2/5' },
		{ value: 'short', label: 'Locale short' },
		{ value: 'iso', label: 'ISO (YYYY-MM-DD)' }
	];
	const TIME_OPTIONS: { value: TimeFormatId; label: string }[] = [
		{ value: '24h', label: '24-hour' },
		{ value: '12h', label: '12-hour' }
	];

	let activeTab = $state<TabId>('global');
	let projectDateFormat = $state<DateFormatId>('yyyy/m/d');
	let projectTimeFormat = $state<TimeFormatId>('24h');
	let projectSaving = $state(false);
	let streams = $state<StreamInfo[]>([]);
	let streamsLoading = $state(false);
	let creatingStreamId = $state<string | null>(null);
	let createMessage = $state('');
	let ingestOrigin = $state('');

	$effect(() => {
		if (browser) ingestOrigin = window.location.origin;
	});

	$effect(() => {
		const settings = $currentProject?.settings?.dateTime;
		projectDateFormat = (settings?.dateFormat as DateFormatId | undefined) ?? 'yyyy/m/d';
		projectTimeFormat = (settings?.timeFormat as TimeFormatId | undefined) ?? '24h';
	});

	$effect(() => {
		if (!$settingsModalOpen || activeTab !== 'streams') return;
		const project = $currentProject;
		if (!project) {
			streams = [];
			return;
		}
		streamsLoading = true;
		fetch(`/api/projects/${project.id}/streams`)
			.then((response) => (response.ok ? response.json() : []))
			.then((value) => {
				streams = Array.isArray(value) ? (value as StreamInfo[]) : [];
			})
			.catch(() => {
				streams = [];
			})
			.finally(() => {
				streamsLoading = false;
			});
	});

	function close(): void {
		settingsModalOpen.set(false);
	}

	function handleOverlayClick(event: MouseEvent): void {
		if ((event.target as HTMLElement).classList.contains('modal-overlay')) close();
	}

	function saveProjectSettings(): void {
		const project = $currentProject;
		if (!project) return;
		projectSaving = true;
		fetch(`/api/projects/${project.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				settings: {
					dateTime: { dateFormat: projectDateFormat, timeFormat: projectTimeFormat }
				}
			})
		})
			.then((response) => {
				if (!response.ok) throw new Error('Failed to save project settings');
				return response.json();
			})
			.then((data) => {
				currentProject.update((value) =>
					value && value.id === data.id ? { ...value, settings: data.settings } : value
				);
			})
			.catch(() => {})
			.finally(() => {
				projectSaving = false;
			});
	}

	function inferStreamKind(stream: StreamInfo): 'gauge' | 'plot' {
		if (stream.metadata?.min !== undefined && stream.metadata?.max !== undefined) return 'gauge';
		return 'plot';
	}

	async function createView(stream: StreamInfo): Promise<void> {
		const project = $currentProject;
		const parentId = $explorerTree?.id;
		if (!project || !parentId) return;
		creatingStreamId = stream.id;
		createMessage = '';
		const kind = inferStreamKind(stream);
		const type = kind === 'gauge' ? 'gauge' : 'line-plot';
		const props =
			kind === 'gauge'
				? {
						dataSource: stream.id,
						displayType: 'dial',
						min: stream.metadata?.min ?? 0,
						max: stream.metadata?.max ?? 100,
						unit: stream.metadata?.unit ?? '',
						label: stream.name
					}
				: { dataSources: [stream.id], seriesNames: [stream.name] };
		try {
			const response = await fetch(`/api/projects/${project.id}/objects`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type,
					parentId,
					name: `${stream.name} (${kind === 'gauge' ? 'Gauge' : 'Plot'})`,
					props
				})
			});
			if (!response.ok) throw new Error('Could not create display');
			createMessage = `Created a ${type} for ${stream.name}`;
			await refreshExplorerTree();
		} catch (error) {
			createMessage = error instanceof Error ? error.message : 'Could not create display';
		} finally {
			creatingStreamId = null;
		}
	}
</script>

{#if $settingsModalOpen}
	<div class="modal-overlay" onclick={handleOverlayClick} role="presentation">
		<div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
			<div class="modal-header">
				<h2 id="settings-title">Settings</h2>
				<button type="button" class="close-btn" aria-label="Close" title="Close" onclick={close}>
					<X size={18} />
				</button>
			</div>
			<div class="tab-bar" role="tablist" aria-label="Settings sections">
				{#each [['global', 'Global settings'], ['project', 'Project settings'], ['streams', 'Streams']] as tab}
					<button
						type="button"
						class="tab"
						class:active={activeTab === tab[0]}
						role="tab"
						aria-selected={activeTab === tab[0]}
						onclick={() => (activeTab = tab[0] as TabId)}>{tab[1]}</button
					>
				{/each}
			</div>
			<div class="modal-body">
				{#if activeTab === 'global'}
					<section class="tab-panel" role="tabpanel">
						<p class="section-desc">Apply when no project override is set.</p>
						<label class="field" for="user-date">Date format</label>
						<select
							id="user-date"
							value={$userSettings.dateFormat}
							onchange={(event) =>
								userSettings.update((s) => ({
									...s,
									dateFormat: (event.target as HTMLSelectElement).value as DateFormatId
								}))}
						>
							{#each DATE_OPTIONS as option}<option value={option.value}>{option.label}</option
								>{/each}
						</select>
						<label class="field" for="user-time">Time format</label>
						<select
							id="user-time"
							value={$userSettings.timeFormat}
							onchange={(event) =>
								userSettings.update((s) => ({
									...s,
									timeFormat: (event.target as HTMLSelectElement).value as TimeFormatId
								}))}
						>
							{#each TIME_OPTIONS as option}<option value={option.value}>{option.label}</option
								>{/each}
						</select>
						<label class="checkbox-label" for="show-advanced-props">
							<input
								id="show-advanced-props"
								type="checkbox"
								checked={$propertyPanelMode === 'advanced'}
								onchange={(event) =>
									propertyPanelMode.set(
										(event.target as HTMLInputElement).checked ? 'advanced' : 'essentials'
									)}
							/>
							Show advanced properties by default
						</label>
					</section>
				{:else if activeTab === 'project'}
					<section class="tab-panel" role="tabpanel">
						<p class="section-desc">Choose how dates and times are shown in this project.</p>
						<label class="field" for="project-date">Date format</label>
						<select id="project-date" bind:value={projectDateFormat}>
							{#each DATE_OPTIONS as option}<option value={option.value}>{option.label}</option
								>{/each}
						</select>
						<label class="field" for="project-time">Time format</label>
						<select id="project-time" bind:value={projectTimeFormat}>
							{#each TIME_OPTIONS as option}<option value={option.value}>{option.label}</option
								>{/each}
						</select>
						<button
							type="button"
							class="save-button"
							disabled={projectSaving || !$currentProject}
							onclick={saveProjectSettings}
							>{projectSaving ? 'Saving…' : 'Save project settings'}</button
						>
					</section>
				{:else}
					<section class="tab-panel" role="tabpanel">
						<p class="section-desc">
							Streams arrive from an external supplier or an imported run. MCS does not execute user
							code.
						</p>
						{#if !$currentProject}
							<p class="empty-state">Open a project to inspect streams.</p>
						{:else if streamsLoading}
							<p class="empty-state">Loading…</p>
						{:else if streams.length === 0}
							<p class="empty-state">No streams are available yet.</p>
						{:else}
							<div class="streams-table-wrap">
								<table class="streams-table">
									<thead
										><tr
											><th scope="col">Stream</th><th scope="col">Unit</th><th scope="col"
												>Display</th
											></tr
										></thead
									><tbody>
										{#each streams as stream}
											<tr
												><td><strong>{stream.name}</strong><br /><code>{stream.id}</code></td><td
													>{stream.metadata?.unit ?? '—'}</td
												><td
													><button
														type="button"
														class="create-button"
														disabled={creatingStreamId !== null}
														onclick={() => createView(stream)}
														>{creatingStreamId === stream.id ? 'Creating…' : 'Create view'}</button
													></td
												></tr
											>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
						{#if createMessage}<p class="message" role="status">{createMessage}</p>{/if}
						<p class="section-desc ingest-note">
							For live acquisition, send normalized samples to <code
								>{ingestOrigin || '/api'}/ingest</code
							>.
						</p>
					</section>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.45);
	}
	.modal {
		width: min(42rem, calc(100vw - 2rem));
		max-height: min(42rem, calc(100vh - 2rem));
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		color: var(--mcs-text);
	}
	.modal-header,
	.tab-bar {
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--mcs-border);
	}
	.modal-header {
		justify-content: space-between;
		padding: 0.75rem 1rem;
	}
	.modal-header h2 {
		margin: 0;
		font-size: 1rem;
	}
	.close-btn {
		display: grid;
		place-items: center;
		padding: 0.3rem;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.tab-bar {
		gap: 0.25rem;
		padding: 0 0.75rem;
	}
	.tab {
		padding: 0.6rem 0.75rem;
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--mcs-text-muted);
		cursor: pointer;
		font: inherit;
		font-size: 0.82rem;
	}
	.tab.active {
		color: var(--mcs-text);
		border-bottom-color: var(--mcs-accent);
	}
	.modal-body {
		min-height: 0;
		overflow: auto;
		padding: 1rem;
	}
	.tab-panel {
		display: grid;
		gap: 0.55rem;
	}
	.section-desc,
	.empty-state,
	.message {
		margin: 0 0 0.45rem;
		color: var(--mcs-text-muted);
		font-size: 0.78rem;
	}
	.field {
		display: block;
		margin-top: 0.35rem;
		color: var(--mcs-text-muted);
		font-size: 0.78rem;
	}
	select {
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.75rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.save-button,
	.create-button {
		width: fit-content;
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.streams-table-wrap {
		overflow: auto;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
	}
	.streams-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}
	.streams-table th,
	.streams-table td {
		padding: 0.45rem 0.55rem;
		border-bottom: 1px solid var(--mcs-border);
		text-align: left;
		vertical-align: middle;
	}
	.streams-table tr:last-child td {
		border-bottom: 0;
	}
	.streams-table code {
		color: var(--mcs-text-muted);
		font-size: 0.7rem;
	}
	.message {
		color: var(--mcs-text);
	}
	.ingest-note {
		margin-top: 0.5rem;
	}
	.ingest-note code {
		overflow-wrap: anywhere;
	}
</style>
