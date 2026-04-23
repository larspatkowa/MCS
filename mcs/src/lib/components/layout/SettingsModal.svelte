<script lang="ts">
	import { currentProject } from '$lib/stores/project';
	import { userSettings, settingsModalOpen } from '$lib/stores/settings';
	import { propertyPanelMode } from '$lib/stores/property-panel';
	import type { DateFormatId, TimeFormatId } from '$lib/date-time-format';
	import { X } from '@lucide/svelte';
	import { explorerTree, refreshExplorerTree } from '$lib/stores/explorerTree';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	type TabId = 'global' | 'project' | 'plugins' | 'streams';

	const BUILTIN_SIMULATION_IDS = new Set([
		'sample-telemetry',
		'rocket-mission',
		'system-sensor',
		'agri-ndvi-mission'
	]);
	interface StreamInfo {
		id: string;
		name: string;
		metadata?: {
			unit?: string;
			min?: number;
			max?: number;
			type?: string;
			[key: string]: unknown;
		};
	}
	interface AvailablePlugin {
		id: string;
		name: string;
		path: string;
		runtime?: 'in-process' | 'process';
		version?: string;
		description?: string;
		streams?: { id: string; name?: string; metadata?: Record<string, unknown> }[];
	}
	interface RunningPlugin {
		id: string;
		status: string;
		pid?: number;
		runtime?: 'in-process' | 'process';
	}
	interface PluginCatalogResponse {
		plugins: Array<{
			id: string;
			name: string;
			path?: string;
			runtime?: 'in-process' | 'process';
			version?: string;
			description?: string;
			status?: 'running' | 'stopped';
			pid?: number;
			streams?: { id: string; name?: string; metadata?: Record<string, unknown> }[];
		}>;
	}

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

	let availablePlugins = $state<AvailablePlugin[]>([]);
	let runningPlugins = $state<RunningPlugin[]>([]);
	let pluginsLoading = $state(false);
	let pluginActionId = $state<string | null>(null);
	let autoStartPlugins = $state<Set<string>>(new Set());

	let simulationPlugins = $derived(
		availablePlugins.filter((p) => BUILTIN_SIMULATION_IDS.has(p.id))
	);
	let otherDatasourcePlugins = $derived(
		availablePlugins.filter((p) => !BUILTIN_SIMULATION_IDS.has(p.id))
	);

	let settingsIngestOrigin = $state('');
	$effect(() => {
		if (browser) settingsIngestOrigin = window.location.origin;
	});

	let hardwareCurlExample = $derived.by(() => {
		const proj = $currentProject;
		const pid = proj?.id ?? 'YOUR_PROJECT_ID';
		const origin = settingsIngestOrigin || 'http://localhost:6000';
		return `curl -X POST ${origin}/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "${pid}",
    "streamId": "my-hardware:temperature",
    "values": { "value": 22.5 }
  }'`;
	});

	let hardwareCopyHint = $state('');
	function copyHardwareSnippet() {
		navigator.clipboard.writeText(hardwareCurlExample).then(
			() => {
				hardwareCopyHint = 'Copied';
				setTimeout(() => {
					hardwareCopyHint = '';
				}, 2000);
			},
			() => {
				hardwareCopyHint = 'Could not copy';
			}
		);
	}

	// Sync auto-start set from current project settings
	$effect(() => {
		const ids: string[] = $currentProject?.settings?.autoStartPlugins ?? [];
		autoStartPlugins = new Set(ids);
	});

	async function saveAutoStartPlugins() {
		const proj = $currentProject;
		if (!proj) return;
		if (false) return;
		const ids = [...autoStartPlugins];
		await fetch(`/api/projects/${proj.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ settings: { ...(proj.settings ?? {}), autoStartPlugins: ids } })
		});
	}

	function toggleAutoStart(pluginId: string) {
		autoStartPlugins = new Set(autoStartPlugins);
		if (autoStartPlugins.has(pluginId)) autoStartPlugins.delete(pluginId);
		else autoStartPlugins.add(pluginId);
		saveAutoStartPlugins();
	}

	async function fetchPlugins() {
		if (false) {
			availablePlugins = [];
			runningPlugins = [];
			return;
		}
		pluginsLoading = true;
		try {
			const catalogRes = await fetch('/api/plugins/catalog');
			if (catalogRes.ok) {
				const catalog = (await catalogRes.json()) as PluginCatalogResponse;
				const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : [];
				availablePlugins = plugins.map((plugin) => ({
					id: plugin.id,
					name: plugin.name,
					path: plugin.path ?? '',
					runtime: plugin.runtime,
					version: plugin.version,
					description: plugin.description,
					streams: plugin.streams ?? []
				}));
				runningPlugins = plugins
					.filter((plugin) => plugin.status === 'running')
					.map((plugin) => ({
						id: plugin.id,
						status: 'running',
						pid: plugin.pid,
						runtime: plugin.runtime
					}));
			}
		} finally {
			pluginsLoading = false;
		}
	}

	$effect(() => {
		if (!$settingsModalOpen || activeTab !== 'plugins') return;
		fetchPlugins();
		const interval = setInterval(fetchPlugins, 4000);
		return () => clearInterval(interval);
	});

	function isPluginRunning(id: string): boolean {
		return runningPlugins.some((p) => p.id === id);
	}

	function getRunningPlugin(id: string): RunningPlugin | undefined {
		return runningPlugins.find((p) => p.id === id);
	}

	async function startPlugin(plugin: AvailablePlugin) {
		const proj = $currentProject;
		if (!proj) return;
		if (false) return;
		pluginActionId = plugin.id;
		try {
			const res = await fetch('/api/plugins/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: plugin.id,
					name: plugin.name,
					path: plugin.path,
					projectId: proj.id
				})
			});
			const data = (await res.json()) as { error?: string; alreadyRunning?: boolean };
			if (data.error) throw new Error(data.error);

			if (!data.alreadyRunning) {
				// Wait briefly for the scaffold to finish, then navigate to the new folder
				await new Promise((r) => setTimeout(r, 600));
				await refreshExplorerTree();

				const objRes = await fetch(`/api/projects/${proj.id}/objects`);
				if (objRes.ok) {
					const tree = (await objRes.json()) as {
						children?: { id: string; type: string; name: string; createdAt: string }[];
					};
					const cutoff = Date.now() - 6000; // created in last 6 s
					const newFolder = (tree.children ?? [])
						.slice()
						.reverse()
						.find((c) => c.type === 'folder' && new Date(c.createdAt).getTime() > cutoff);
					if (newFolder) {
						close();
						await goto(`?object=${newFolder.id}`);
						return;
					}
				}
			}

			await fetchPlugins();
		} catch (e) {
			console.error(e);
		} finally {
			pluginActionId = null;
		}
	}

	async function stopPlugin(id: string) {
		pluginActionId = id;
		if (false) return;
		try {
			await fetch('/api/plugins/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			await fetchPlugins();
		} finally {
			pluginActionId = null;
		}
	}

	$effect(() => {
		const proj = $currentProject;
		if (proj?.settings?.dateTime) {
			projectDateFormat = (proj.settings.dateTime.dateFormat as DateFormatId) ?? 'yyyy/m/d';
			projectTimeFormat = (proj.settings.dateTime.timeFormat as TimeFormatId) ?? '24h';
		} else {
			projectDateFormat = 'yyyy/m/d';
			projectTimeFormat = '24h';
		}
	});

	function close() {
		settingsModalOpen.set(false);
	}

	function saveProjectSettings() {
		const proj = $currentProject;
		if (!proj) return;
		if (false) return;
		projectSaving = true;
		fetch(`/api/projects/${proj.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				settings: {
					dateTime: {
						dateFormat: projectDateFormat,
						timeFormat: projectTimeFormat
					}
				}
			})
		})
			.then((r) => {
				if (!r.ok) throw new Error('Failed to save');
				return r.json();
			})
			.then((data) => {
				currentProject.update((p) =>
					p && p.id === data.id ? { ...p, settings: data.settings } : p
				);
			})
			.catch(() => {})
			.finally(() => {
				projectSaving = false;
			});
	}

	function handleOverlayClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('modal-overlay')) close();
	}

	// ── Streams (plugin discovery) ──────────────────────────────────
	let streams = $state<StreamInfo[]>([]);
	let streamsLoading = $state(false);
	let creatingStreamId = $state<string | null>(null);
	let createMessage = $state('');
	let creatingAllForPlugin = $state<string | null>(null);

	async function quickCreateAll(plugin: AvailablePlugin) {
		const proj = $currentProject;
		const rootId = $explorerTree?.id;
		if (!proj || !rootId || !plugin.streams?.length) return;
		creatingAllForPlugin = plugin.id;
		try {
			let created = 0;
			for (const s of plugin.streams) {
				const streamInfo: StreamInfo = {
					id: s.id,
					name: s.name ?? s.id,
					metadata: s.metadata as StreamInfo['metadata']
				};
				try {
					await quickCreate(streamInfo);
					created++;
				} catch {
					/* skip */
				}
			}
			createMessage = `✓ Created ${created} view${created !== 1 ? 's' : ''} for ${plugin.name}`;
			setTimeout(() => {
				createMessage = '';
			}, 3500);
		} finally {
			creatingAllForPlugin = null;
		}
	}

	async function fetchStreams() {
		const proj = $currentProject;
		if (!proj) {
			streams = [];
			return;
		}
		if (false) {
			streams = [];
			return;
		}
		streamsLoading = true;
		try {
			const res = await fetch(`/api/projects/${proj.id}/streams`);
			if (res.ok) streams = (await res.json()) as StreamInfo[];
		} finally {
			streamsLoading = false;
		}
	}

	$effect(() => {
		if (!$settingsModalOpen || activeTab !== 'streams') return;
		fetchStreams();
	});

	function inferStreamKind(s: StreamInfo): 'gps' | 'gauge' | 'plot' {
		// Detect GPS / location streams by ID pattern
		if (/gps|GPS|location|geo|nav/i.test(s.id)) return 'gps';
		if (s.metadata?.min !== undefined && s.metadata?.max !== undefined) return 'gauge';
		return 'plot';
	}

	async function quickCreate(stream: StreamInfo) {
		const proj = $currentProject;
		const rootId = $explorerTree?.id;
		if (!proj || !rootId) return;
		if (false) return;
		const kind = inferStreamKind(stream);
		creatingStreamId = stream.id;
		createMessage = '';
		try {
			let type: string;
			let props: Record<string, unknown>;
			let nameSuffix: string;
			if (kind === 'gps') {
				type = 'map-view';
				props = {
					gpsStreamId: stream.id,
					baseLayer: 'satellite',
					showGpsTrail: true,
					autoFollow: true
				};
				nameSuffix = 'Map';
			} else if (kind === 'gauge') {
				type = 'gauge';
				props = {
					dataSource: stream.id,
					displayType: 'dial',
					min: stream.metadata!.min,
					max: stream.metadata!.max,
					unit: stream.metadata?.unit ?? '',
					label: stream.name
				};
				nameSuffix = 'Gauge';
			} else {
				type = 'line-plot';
				props = {
					dataSources: [stream.id],
					seriesNames: [stream.name]
				};
				nameSuffix = 'Plot';
			}
			const res = await fetch(`/api/projects/${proj.id}/objects`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type,
					parentId: rootId,
					name: `${stream.name} (${nameSuffix})`,
					props
				})
			});
			if (res.ok) {
				createMessage = `✓ Created "${stream.name} (${nameSuffix})"`;
				refreshExplorerTree();
			} else {
				const d = (await res.json()) as { error?: string };
				createMessage = `Error: ${d.error ?? 'Unknown'}`;
			}
		} catch (e) {
			createMessage = `Error: ${e instanceof Error ? e.message : 'Unknown'}`;
		} finally {
			creatingStreamId = null;
			setTimeout(() => {
				createMessage = '';
			}, 3000);
		}
	}
</script>

{#if $settingsModalOpen}
	<div class="modal-overlay" onclick={handleOverlayClick} role="presentation">
		<div class="modal" role="dialog" aria-labelledby="settings-title">
			<div class="modal-header">
				<h2 id="settings-title">Settings</h2>
				<button type="button" class="close-btn" aria-label="Close" title="Close" onclick={close}>
					<X size={18} />
				</button>
			</div>
			<div class="tab-bar" role="tablist" aria-label="Settings sections">
				<button
					type="button"
					class="tab"
					class:active={activeTab === 'global'}
					role="tab"
					aria-selected={activeTab === 'global'}
					aria-controls="settings-panel-global"
					id="tab-global"
					onclick={() => (activeTab = 'global')}
				>
					Global settings
				</button>
				<button
					type="button"
					class="tab"
					class:active={activeTab === 'project'}
					role="tab"
					aria-selected={activeTab === 'project'}
					aria-controls="settings-panel-project"
					id="tab-project"
					onclick={() => (activeTab = 'project')}
				>
					Project settings
				</button>
				<button
					type="button"
					class="tab"
					class:active={activeTab === 'plugins'}
					role="tab"
					aria-selected={activeTab === 'plugins'}
					aria-controls="settings-panel-plugins"
					id="tab-plugins"
					onclick={() => (activeTab = 'plugins')}
				>
					Data sources
				</button>
				<button
					type="button"
					class="tab"
					class:active={activeTab === 'streams'}
					role="tab"
					aria-selected={activeTab === 'streams'}
					aria-controls="settings-panel-streams"
					id="tab-streams"
					onclick={() => (activeTab = 'streams')}
				>
					Streams
				</button>
			</div>
			<div class="modal-body">
				{#if false}
					<p class="section-desc">
						This is a static, browser-only demo build. Project editing, ingest, plugins, and stream discovery are disabled.
					</p>
				{/if}
				{#if activeTab === 'global'}
					<div
						id="settings-panel-global"
						class="tab-panel"
						role="tabpanel"
						aria-labelledby="tab-global"
						tabindex="0"
					>
						<p class="section-desc">
							Apply when no project override is set. Changes are saved automatically.
						</p>
						<div class="field">
							<label for="user-date">Date format</label>
							<select
								id="user-date"
								value={$userSettings.dateFormat}
								onchange={(e) => {
									const v = (e.target as HTMLSelectElement).value as DateFormatId;
									userSettings.update((s) => ({ ...s, dateFormat: v }));
								}}
							>
								{#each DATE_OPTIONS as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label for="user-time">Time format</label>
							<select
								id="user-time"
								value={$userSettings.timeFormat}
								onchange={(e) => {
									const v = (e.target as HTMLSelectElement).value as TimeFormatId;
									userSettings.update((s) => ({ ...s, timeFormat: v }));
								}}
							>
								{#each TIME_OPTIONS as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						</div>
						<div class="field checkbox-field">
							<label class="checkbox-label" for="show-advanced-props">
								<input
									id="show-advanced-props"
									type="checkbox"
									checked={$propertyPanelMode === 'advanced'}
									onchange={(e) =>
										propertyPanelMode.set(
											(e.target as HTMLInputElement).checked ? 'advanced' : 'essentials'
										)}
								/>
								Show advanced properties by default
							</label>
						</div>
						<div class="field shortcuts-section">
							<span class="field-label" id="shortcuts-heading">Keyboard shortcuts</span>
							<dl class="shortcuts-list" aria-labelledby="shortcuts-heading">
								<dt>Command palette</dt>
								<dd>Ctrl+K / ⌘K</dd>
								<dt>Clear selection</dt>
								<dd>Escape</dd>
							</dl>
						</div>
					</div>
				{:else if activeTab === 'plugins'}
					<div
						id="settings-panel-plugins"
						class="tab-panel"
						role="tabpanel"
						aria-labelledby="tab-plugins"
						tabindex="0"
					>
						<p class="section-desc">
							Built-in simulations feed the same ingest pipeline as your own hardware. External
							connectors are scripts MCS can spawn; you can also POST to the ingest API from
							anywhere.
						</p>
						<p class="plugin-editor-intro">
							<button
								type="button"
								class="plugin-editor-link"
								onclick={() => {
									settingsModalOpen.set(false);
									goto('/plugin-editor');
								}}
							>
								Open plugin editor
							</button>
							<span class="plugin-editor-intro-text">
								Edit external <code>.mjs</code> / <code>.py</code> files under
								<code>data/user-plugins/</code>, save, then start or restart from the editor
								toolbar.
							</span>
						</p>
						{#if !pluginsLoading && availablePlugins.length > 0}
							<p class="plugins-status-dashboard">
								{runningPlugins.length} of {availablePlugins.length} sources running
							</p>
						{/if}
						{#if pluginsLoading}
							<p class="section-desc">Loading…</p>
						{:else if availablePlugins.length === 0}
							<p class="section-desc empty-state">
								No data sources found. Add scripts next to the app or configure plugins-config.json
								(see documentation).
							</p>
						{:else}
							{#if simulationPlugins.length > 0}
								<h3 class="ds-section-title">Simulations</h3>
								<p class="section-desc">Demo telemetry generated inside MCS.</p>
								<div class="plugins-table-wrap">
									<table class="plugins-table" role="grid">
										<thead>
											<tr>
												<th scope="col">Name</th>
												<th scope="col">Kind</th>
												<th scope="col">Status</th>
												<th scope="col">Auto-start</th>
												<th scope="col">Actions</th>
											</tr>
										</thead>
										<tbody>
											{#each simulationPlugins as plugin}
												<tr>
													<td>
														<div class="plugin-name-cell">
															<span>{plugin.name}</span>
															{#if plugin.version}
																<span class="plugin-version">v{plugin.version}</span>
															{/if}
														</div>
													</td>
													<td class="plugin-runtime-cell">Built-in</td>
													<td>
														{#if isPluginRunning(plugin.id)}
															{@const runInfo = getRunningPlugin(plugin.id)}
															Running{#if runInfo?.pid}
																(PID {runInfo.pid}){/if}
														{:else}
															Stopped
														{/if}
													</td>
													<td class="plugin-autostart-cell">
														<input
															type="checkbox"
															checked={autoStartPlugins.has(plugin.id)}
															disabled={!$currentProject}
															title={$currentProject
																? 'Start this simulation automatically when the project opens'
																: 'Open a project first'}
															onchange={() => toggleAutoStart(plugin.id)}
														/>
													</td>
													<td>
														{#if isPluginRunning(plugin.id)}
															<button
																type="button"
																class="plugin-btn stop"
																disabled={pluginActionId !== null}
																onclick={() => stopPlugin(plugin.id)}
															>
																{pluginActionId === plugin.id ? 'Stopping…' : 'Stop'}
															</button>
														{:else}
															<button
																type="button"
																class="plugin-btn start"
																disabled={!$currentProject || pluginActionId !== null}
																title={$currentProject
																	? 'Start with current project'
																	: 'Open a project first'}
																onclick={() => startPlugin(plugin)}
															>
																{pluginActionId === plugin.id ? 'Starting…' : 'Start'}
															</button>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}

							{#if otherDatasourcePlugins.length > 0}
								<h3 class="ds-section-title ds-section-title-spaced">Other connectors</h3>
								<p class="section-desc">Separate processes MCS starts for you.</p>
								<div class="plugins-table-wrap">
									<table class="plugins-table" role="grid">
										<thead>
											<tr>
												<th scope="col">Name</th>
												<th scope="col">Kind</th>
												<th scope="col">Status</th>
												<th scope="col">Auto-start</th>
												<th scope="col">Actions</th>
											</tr>
										</thead>
										<tbody>
											{#each otherDatasourcePlugins as plugin}
												<tr>
													<td>
														<div class="plugin-name-cell">
															<span>{plugin.name}</span>
															{#if plugin.version}
																<span class="plugin-version">v{plugin.version}</span>
															{/if}
														</div>
													</td>
													<td class="plugin-runtime-cell">External process</td>
													<td>
														{#if isPluginRunning(plugin.id)}
															{@const runInfo = getRunningPlugin(plugin.id)}
															Running{#if runInfo?.pid}
																(PID {runInfo.pid}){/if}
														{:else}
															Stopped
														{/if}
													</td>
													<td class="plugin-autostart-cell">
														<input
															type="checkbox"
															checked={autoStartPlugins.has(plugin.id)}
															disabled={!$currentProject}
															title={$currentProject
																? 'Start this connector automatically when the project opens'
																: 'Open a project first'}
															onchange={() => toggleAutoStart(plugin.id)}
														/>
													</td>
													<td>
														{#if isPluginRunning(plugin.id)}
															<button
																type="button"
																class="plugin-btn stop"
																disabled={pluginActionId !== null}
																onclick={() => stopPlugin(plugin.id)}
															>
																{pluginActionId === plugin.id ? 'Stopping…' : 'Stop'}
															</button>
														{:else}
															<button
																type="button"
																class="plugin-btn start"
																disabled={!$currentProject || pluginActionId !== null}
																title={$currentProject
																	? 'Start with current project'
																	: 'Open a project first'}
																onclick={() => startPlugin(plugin)}
															>
																{pluginActionId === plugin.id ? 'Starting…' : 'Start'}
															</button>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}

							<h3 class="ds-section-title ds-section-title-spaced">External hardware</h3>
							<p class="section-desc">
								Send samples with HTTP from firmware, scripts, or another service. Replace stream
								IDs and JSON fields to match your sensors.
							</p>
							<div class="hardware-snippet-wrap">
								<button type="button" class="hardware-copy-btn" onclick={copyHardwareSnippet}
									>Copy curl</button
								>
								{#if hardwareCopyHint}
									<span class="hardware-copy-hint" role="status">{hardwareCopyHint}</span>
								{/if}
								<pre class="hardware-pre">{hardwareCurlExample}</pre>
							</div>

							{#if !$currentProject}
								<p class="section-desc">Open a project to start simulations or connectors.</p>
							{/if}
						{/if}
					</div>
				{:else if activeTab === 'streams'}
					<div
						id="settings-panel-streams"
						class="tab-panel"
						role="tabpanel"
						aria-labelledby="tab-streams"
						tabindex="0"
					>
						<p class="section-desc">
							Streams declared by running simulations or connectors, or created when you ingest
							data. Click
							<strong>Create View</strong> to add a widget for any stream.
						</p>
						{#if !$currentProject}
							<p class="section-desc empty-state">Open a project to see its streams.</p>
						{:else if streamsLoading}
							<p class="section-desc">Loading…</p>
						{:else if streams.length === 0}
							<p class="section-desc empty-state">
								No streams yet. Start a simulation, send data to the ingest API, or run a connector.
							</p>
						{:else}
							<!-- Fixed-height wrapper prevents table layout shift when message appears -->
							<div class="stream-create-msg-wrap" aria-live="polite">
								{#if createMessage}
									<p class="stream-create-msg" class:error={createMessage.startsWith('Error')}>
										{createMessage}
									</p>
								{/if}
							</div>
							<div class="streams-table-wrap">
								<table class="streams-table">
									<thead>
										<tr>
											<th>Stream</th>
											<th>Unit</th>
											<th>Range</th>
											<th>Type</th>
											<th>Create View</th>
										</tr>
									</thead>
									<tbody>
										{#each streams as stream}
											{@const kind = inferStreamKind(stream)}
											<tr>
												<td>
													<div class="stream-name-cell">
														<span class="stream-name">{stream.name}</span>
														<span class="stream-id">{stream.id}</span>
													</div>
												</td>
												<td class="stream-unit">{stream.metadata?.unit ?? '—'}</td>
												<td class="stream-range">
													{#if stream.metadata?.min !== undefined && stream.metadata?.max !== undefined}
														{stream.metadata.min} – {stream.metadata.max}
													{:else}
														—
													{/if}
												</td>
												<td>
													<span class="stream-kind-badge kind-{kind}">
														{kind === 'gps' ? 'GPS' : kind === 'gauge' ? 'Numeric' : 'Series'}
													</span>
												</td>
												<td>
													<button
														type="button"
														class="stream-create-btn"
														disabled={creatingStreamId !== null || !$explorerTree}
														onclick={() => quickCreate(stream)}
													>
														{creatingStreamId === stream.id
															? 'Creating…'
															: kind === 'gps'
																? '+ Map'
																: kind === 'gauge'
																	? '+ Gauge'
																	: '+ Plot'}
													</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<p class="section-desc" style="margin-top: 8px; font-size: 11px;">
								Objects are created in the project root. Drag them into layouts from the Explorer.
							</p>
						{/if}
					</div>
				{:else}
					<div
						id="settings-panel-project"
						class="tab-panel"
						role="tabpanel"
						aria-labelledby="tab-project"
						tabindex="0"
					>
						{#if $currentProject}
							<p class="section-desc">Override for this project only.</p>
							<div class="field">
								<label for="proj-date">Date format</label>
								<select id="proj-date" bind:value={projectDateFormat}>
									{#each DATE_OPTIONS as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</div>
							<div class="field">
								<label for="proj-time">Time format</label>
								<select id="proj-time" bind:value={projectTimeFormat}>
									{#each TIME_OPTIONS as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</div>
							<button
								type="button"
								class="save-project-btn"
								onclick={saveProjectSettings}
								disabled={projectSaving}
							>
								{projectSaving ? 'Saving…' : 'Save project settings'}
							</button>
						{:else}
							<p class="section-desc empty-state">
								Open or select a project to configure project-specific settings.
							</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3000;
	}
	.modal {
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		width: var(--mcs-modal-width);
		min-width: var(--mcs-modal-width);
		max-width: min(var(--mcs-modal-width), 90vw);
		min-height: var(--mcs-modal-min-height);
		max-height: var(--mcs-modal-max-height);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}
	.modal-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	.modal-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--mcs-text);
	}
	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: var(--mcs-text-muted);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: var(--mcs-radius);
	}
	.close-btn:hover {
		color: var(--mcs-text);
		background: var(--mcs-surface-alt);
	}
	.tab-bar {
		flex-shrink: 0;
		display: flex;
		gap: 0;
		padding: 0 1rem;
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface);
	}
	.tab {
		position: relative;
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--mcs-text-muted);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		cursor: pointer;
		font-family: inherit;
	}
	.tab.active {
		color: var(--mcs-text);
		border-bottom-color: var(--mcs-accent);
	}
	.tab:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.tab-panel {
		outline: none;
	}
	.modal-body {
		flex: 1;
		min-height: 0;
		padding: 1rem;
		overflow: auto;
	}
	.plugins-status-dashboard {
		margin: 0 0 0.5rem 0;
		font-size: 0.8rem;
		color: var(--mcs-text);
	}
	.ds-section-title {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--mcs-text);
	}
	.ds-section-title-spaced {
		margin-top: 1rem;
	}
	.hardware-snippet-wrap {
		position: relative;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		background: var(--mcs-bg);
		padding: 0.5rem 0.65rem 0.65rem;
		margin-bottom: 0.5rem;
	}
	.hardware-copy-btn {
		font-size: 0.72rem;
		padding: 0.25rem 0.5rem;
		margin-bottom: 0.35rem;
		font-family: var(--mcs-font-sans);
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.hardware-copy-btn:hover {
		background: var(--mcs-border);
	}
	.hardware-copy-hint {
		font-size: 0.72rem;
		color: var(--mcs-accent);
		margin-left: 0.5rem;
	}
	.hardware-pre {
		margin: 0;
		font-size: 0.68rem;
		line-height: 1.45;
		overflow: auto;
		max-height: 10rem;
		font-family: var(--mcs-font-mono, monospace);
		color: var(--mcs-text);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.section-desc.empty-state {
		margin-bottom: 0;
	}
	.section-desc {
		margin: 0 0 0.75rem 0;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
	}
	.plugin-editor-intro {
		margin: 0 0 0.85rem 0;
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		line-height: 1.45;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem 0.5rem;
	}
	.plugin-editor-link {
		font-family: inherit;
		font-size: inherit;
		padding: 0;
		border: none;
		background: none;
		color: var(--mcs-accent);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.plugin-editor-link:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
	.plugin-editor-intro-text code {
		font-size: 0.68rem;
	}
	.field {
		margin-bottom: 0.75rem;
	}
	.field label {
		display: block;
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
		margin-bottom: 0.25rem;
	}
	.field select {
		width: 100%;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		padding: 0.35rem 0.5rem;
		font-size: 0.85rem;
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.checkbox-field {
		margin-top: -0.1rem;
	}
	.checkbox-label {
		display: inline-flex !important;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0 !important;
		color: var(--mcs-text) !important;
		cursor: pointer;
	}
	.checkbox-label input {
		margin: 0;
		accent-color: var(--mcs-accent);
	}
	.save-project-btn {
		margin-top: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		font-size: 0.85rem;
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.save-project-btn:hover:not(:disabled) {
		background: var(--mcs-border);
	}
	.save-project-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}
	.plugins-table-wrap {
		overflow-x: auto;
		margin-bottom: 0.5rem;
	}
	.plugins-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.plugins-table th,
	.plugins-table td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--mcs-border);
	}
	.plugins-table th {
		color: var(--mcs-text-muted);
		font-weight: 500;
	}
	.plugin-name-cell {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
	}
	.plugin-version {
		font-size: 0.72rem;
		color: var(--mcs-text-muted);
	}
	.plugin-runtime-cell {
		white-space: nowrap;
	}

	.plugin-btn {
		padding: 0.25rem 0.5rem;
		font-size: 0.8rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: var(--mcs-radius);
		cursor: pointer;
	}
	.plugin-btn:hover:not(:disabled) {
		background: var(--mcs-border);
	}
	.plugin-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.shortcuts-section {
		margin-top: 1rem;
	}
	.shortcuts-section .field-label {
		display: block;
		font-size: 0.8rem;
		color: var(--mcs-text-muted);
		margin-bottom: 0.25rem;
	}
	.shortcuts-list {
		margin: 0.25rem 0 0 0;
		font-size: 0.8rem;
		color: var(--mcs-text);
	}
	.shortcuts-list dt {
		margin-top: 0.35rem;
		font-weight: 500;
	}
	.shortcuts-list dt:first-child {
		margin-top: 0;
	}
	.shortcuts-list dd {
		margin: 0.1rem 0 0 1rem;
		color: var(--mcs-text-muted);
	}

	.plugin-actions-cell {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.plugin-btn.create-views {
		background: color-mix(in srgb, var(--mcs-accent, #4f9cf9) 15%, transparent);
		border-color: color-mix(in srgb, var(--mcs-accent, #4f9cf9) 40%, transparent);
		color: var(--mcs-accent, #4f9cf9);
		font-size: 0.75rem;
	}
	.plugin-btn.create-views:hover:not(:disabled) {
		background: color-mix(in srgb, var(--mcs-accent, #4f9cf9) 25%, transparent);
	}
	/* ── Streams tab ── */
	.streams-table-wrap {
		overflow-x: auto;
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
	}
	.streams-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}
	.streams-table th {
		padding: 6px 10px;
		text-align: left;
		font-weight: 500;
		color: var(--mcs-text-muted);
		border-bottom: 1px solid var(--mcs-border);
		background: var(--mcs-surface-alt);
		white-space: nowrap;
	}
	.streams-table td {
		padding: 6px 10px;
		border-bottom: 1px solid var(--mcs-border);
		vertical-align: middle;
	}
	.streams-table tr:last-child td {
		border-bottom: none;
	}
	.stream-name-cell {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.stream-name {
		font-weight: 500;
		color: var(--mcs-text);
	}
	.stream-id {
		font-family: var(--mcs-font-mono);
		font-size: 0.7rem;
		color: var(--mcs-text-muted);
	}
	.stream-unit {
		font-family: var(--mcs-font-mono);
		color: var(--mcs-text-muted);
	}
	.stream-range {
		font-family: var(--mcs-font-mono);
		font-size: 0.75rem;
		color: var(--mcs-text-muted);
		white-space: nowrap;
	}
	.stream-kind-badge {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 3px;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.kind-gps {
		background: color-mix(in srgb, #22c55e 15%, transparent);
		color: #22c55e;
	}
	.kind-gauge {
		background: color-mix(in srgb, #4f9cf9 15%, transparent);
		color: #4f9cf9;
	}
	.kind-plot {
		background: color-mix(in srgb, #a78bfa 15%, transparent);
		color: #a78bfa;
	}
	.stream-create-btn {
		padding: 3px 8px;
		font-size: 0.75rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		border-radius: var(--mcs-radius);
		color: var(--mcs-text);
		cursor: pointer;
		white-space: nowrap;
	}
	.stream-create-btn:hover:not(:disabled) {
		background: var(--mcs-border);
	}
	.stream-create-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.stream-create-msg-wrap {
		min-height: 2rem;
		margin-bottom: 0.3rem;
		display: flex;
		align-items: center;
	}
	.stream-create-msg {
		margin: 0;
		padding: 5px 10px;
		border-radius: var(--mcs-radius);
		font-size: 0.78rem;
		background: color-mix(in srgb, #22c55e 12%, transparent);
		color: #22c55e;
		border: 1px solid color-mix(in srgb, #22c55e 30%, transparent);
	}
	.stream-create-msg.error {
		background: color-mix(in srgb, #ef4444 12%, transparent);
		color: #ef4444;
		border-color: color-mix(in srgb, #ef4444 30%, transparent);
	}
</style>
