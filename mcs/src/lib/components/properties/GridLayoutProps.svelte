<script lang="ts">
	import { onDestroy } from 'svelte';
	import { untrack } from 'svelte';
	import { currentProject } from '$lib/stores/project.js';
	import { replayClock } from '$lib/stores/replay-session.js';
	import type { GridLayoutProps } from '$lib/objects/types.js';
	import PropSection from './PropSection.svelte';
	import PropRow from './PropRow.svelte';
	import PropNumber from './PropNumber.svelte';
	import PropCheckbox from './PropCheckbox.svelte';
	import PropSelect from './PropSelect.svelte';

	let { props, objectId, onUpdate } = $props<{
		props: GridLayoutProps;
		objectId?: string;
		onUpdate?: (props: GridLayoutProps) => void;
	}>();

	let localProps = $state<GridLayoutProps>(untrack(() => ({ ...props })));

	// Re-sync when parent selects a different object (same component reused)
	$effect(() => {
		localProps = { ...props } as GridLayoutProps;
	});

	function update(key: keyof GridLayoutProps, value: unknown) {
		localProps = { ...localProps, [key]: value };
		onUpdate?.(localProps);
	}

	interface RunOption {
		id: string;
		status: string;
		startedAt: number;
		endedAt: number | null;
		metadata?: Record<string, unknown>;
	}

	let runs = $state<RunOption[]>([]);
	let selectedRunId = $state('');
	let renderStart = $state(0);
	let renderEnd = $state(1);
	let renderFps = $state(60);
	let renderWidth = $state(1920);
	let renderHeight = $state(1080);
	let renderFormat = $state<'h264' | 'prores4444'>('h264');
	let renderTransparent = $state(false);
	let renderBusy = $state(false);
	let renderError = $state<string | null>(null);
	let renderJob = $state<{
		id: string;
		status: string;
		error: string | null;
		spec: { format: string };
		manifest: Record<string, unknown>;
	} | null>(null);
	let clockInitialized = $state(false);
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let renderController: AbortController | null = null;
	const MAX_RENDER_POLLS = 400;
	const formatOptions = $derived(
		localProps.backgroundMode === 'transparent'
			? [{ value: 'prores4444', label: 'ProRes 4444 + alpha' }]
			: [
					{ value: 'h264', label: 'H.264 MP4' },
					{ value: 'prores4444', label: 'ProRes 4444 + alpha' }
				]
	);

	const runOptions = $derived([
		{ value: '', label: $replayClock.runId ? 'Current replay run' : 'No run (static render)' },
		...runs
			.filter((run) => run.status === 'finalized')
			.map((run) => ({
				value: run.id,
				label: `${new Date(run.startedAt * 1000).toLocaleString()} · ${run.status}`
			}))
	]);

	$effect(() => {
		const project = $currentProject;
		if (!project) return;
		const controller = new AbortController();
		fetch(`/api/projects/${encodeURIComponent(project.id)}/runs?limit=200`, {
			signal: controller.signal
		})
			.then((response) => (response.ok ? response.json() : { runs: [] }))
			.then((payload) => {
				runs = Array.isArray(payload.runs) ? payload.runs : [];
			})
			.catch(() => {
				if (!controller.signal.aborted) runs = [];
			});
		return () => controller.abort();
	});

	$effect(() => {
		const clock = $replayClock;
		if (clockInitialized || clock.mode === 'live') return;
		clockInitialized = true;
		selectedRunId = clock.runId ?? '';
		renderStart = clock.start;
		renderEnd = Math.max(clock.start + 0.001, clock.end);
		renderFps = clock.frameRate;
	});

	onDestroy(() => {
		if (pollTimer) clearTimeout(pollTimer);
		renderController?.abort();
	});

	function renderDownloadUrl(jobId: string): string {
		const project = $currentProject;
		return project
			? `/api/projects/${encodeURIComponent(project.id)}/render-jobs/${encodeURIComponent(jobId)}/file`
			: '#';
	}

	function selectRenderRun(value: string): void {
		selectedRunId = value;
		const selected = runs.find((run) => run.id === value);
		if (selected) {
			const metadataStart =
				typeof selected.metadata?.timelineStart === 'number'
					? selected.metadata.timelineStart
					: selected.startedAt;
			const metadataEnd =
				typeof selected.metadata?.timelineEnd === 'number'
					? selected.metadata.timelineEnd
					: (selected.endedAt ?? metadataStart + 1);
			renderStart = metadataStart;
			renderEnd = Math.max(metadataStart + 0.001, metadataEnd);
		}
	}

	async function pollRenderJob(jobId: string, signal: AbortSignal): Promise<void> {
		const project = $currentProject;
		if (!project) return;
		for (let attempt = 0; attempt < MAX_RENDER_POLLS; attempt += 1) {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(project.id)}/render-jobs/${encodeURIComponent(jobId)}`,
				{ signal }
			);
			if (!response.ok) throw new Error('Unable to read render job status');
			const job = await response.json();
			renderJob = job;
			if (job.status !== 'queued' && job.status !== 'running') {
				if (job.status === 'failed') throw new Error(job.error ?? 'Render failed');
				return;
			}
			if (attempt === MAX_RENDER_POLLS - 1) {
				throw new Error('Render status polling timed out; check the job again later.');
			}
			await waitForPoll(signal);
		}
	}

	async function waitForPoll(signal: AbortSignal): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const onAbort = () => {
				if (pollTimer) clearTimeout(pollTimer);
				pollTimer = null;
				reject(new DOMException('Render polling aborted', 'AbortError'));
			};
			if (signal.aborted) {
				onAbort();
				return;
			}
			const finish = () => {
				signal.removeEventListener('abort', onAbort);
				pollTimer = null;
				resolve();
			};
			signal.addEventListener('abort', onAbort, { once: true });
			pollTimer = setTimeout(finish, 750);
		});
	}

	async function renderLayout(): Promise<void> {
		const project = $currentProject;
		if (!project || !objectId || renderBusy) return;
		if (!Number.isFinite(renderStart) || !Number.isFinite(renderEnd) || renderEnd <= renderStart) {
			renderError = 'Render end must be greater than start';
			return;
		}
		renderBusy = true;
		renderError = null;
		renderJob = null;
		renderController?.abort();
		const controller = new AbortController();
		renderController = controller;
		try {
			const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/render-jobs`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				signal: controller.signal,
				body: JSON.stringify({
					objectId,
					runId: selectedRunId || $replayClock.runId || undefined,
					start: renderStart,
					end: renderEnd,
					fps: renderFps,
					width: renderWidth,
					height: renderHeight,
					format:
						renderTransparent || localProps.backgroundMode === 'transparent'
							? 'prores4444'
							: renderFormat,
					background:
						localProps.backgroundMode === 'solid' ? localProps.backgroundColor : '#202020',
					transparent: renderTransparent || localProps.backgroundMode === 'transparent'
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) throw new Error(payload?.error ?? 'Unable to queue render');
			renderJob = payload;
			await pollRenderJob(payload.id, controller.signal);
		} catch (reason) {
			if (!(reason instanceof Error && reason.name === 'AbortError')) {
				renderError = reason instanceof Error ? reason.message : String(reason);
			}
		} finally {
			renderController = null;
			renderBusy = false;
		}
	}
</script>

<div class="grid-layout-props">
	<PropSection title="Grid" id="grid-layout-grid" open={true}>
		<PropRow label="Horizontal grid size (px)">
			<PropNumber
				value={(localProps.gridSize?.[0] as number) ?? 10}
				min={1}
				onChange={(v) => update('gridSize', [v ?? 10, localProps.gridSize?.[1] ?? 10])}
			/>
		</PropRow>
		<PropRow label="Vertical grid size (px)">
			<PropNumber
				value={(localProps.gridSize?.[1] as number) ?? 10}
				min={1}
				onChange={(v) => update('gridSize', [localProps.gridSize?.[0] ?? 10, v ?? 10])}
			/>
		</PropRow>
	</PropSection>
	<PropSection title="Canvas" id="grid-layout-canvas" advanced={true}>
		<PropRow label="Background">
			<PropSelect
				value={localProps.backgroundMode ?? 'theme'}
				options={[
					{ value: 'theme', label: 'Theme' },
					{ value: 'solid', label: 'Solid color' },
					{ value: 'transparent', label: 'Transparent' }
				]}
				onChange={(v) => update('backgroundMode', v)}
			/>
		</PropRow>
		{#if localProps.backgroundMode === 'solid'}
			<PropRow label="Background color"
				><input
					type="color"
					value={localProps.backgroundColor ?? '#202020'}
					onchange={(event) =>
						update('backgroundColor', (event.currentTarget as HTMLInputElement).value)}
				/></PropRow
			>
		{/if}
		<PropRow label="Design grid"
			><PropCheckbox
				checked={localProps.showGrid !== false}
				label="Show grid lines"
				onChange={(v) => update('showGrid', v)}
			/></PropRow
		>
		<PropRow label="Item chrome"
			><PropCheckbox
				checked={localProps.showChrome !== false}
				label="Show item title bars"
				onChange={(v) => update('showChrome', v)}
			/></PropRow
		>
		<PropRow label="Width (px, optional)">
			<PropNumber
				value={(localProps.dimensions?.[0] as number) ?? undefined}
				placeholder="Auto"
				onChange={(v) =>
					update('dimensions', v != null ? [v, localProps.dimensions?.[1] ?? 0] : undefined)}
			/>
		</PropRow>
		<PropRow label="Height (px, optional)">
			<PropNumber
				value={(localProps.dimensions?.[1] as number) ?? undefined}
				placeholder="Auto"
				onChange={(v) =>
					update('dimensions', v != null ? [localProps.dimensions?.[0] ?? 0, v] : undefined)}
			/>
		</PropRow>
		<PropRow label="Scale to fit">
			<PropCheckbox
				checked={(localProps.scaleToFit as boolean) ?? true}
				label="Scale to fit available center area"
				onChange={(v) => update('scaleToFit', v)}
			/>
		</PropRow>
	</PropSection>
	{#if objectId}
		<PropSection title="Video export" id="grid-layout-export" advanced={true}>
			<PropRow
				label="Replay run"
				tooltip="Use the current replay run or choose a finalized run for a data-driven export."
			>
				<PropSelect value={selectedRunId} options={runOptions} onChange={selectRenderRun} />
			</PropRow>
			<PropRow label="Start (s)"
				><PropNumber
					value={renderStart}
					step="any"
					onChange={(value) => (renderStart = value ?? renderStart)}
				/></PropRow
			>
			<PropRow label="End (s)"
				><PropNumber
					value={renderEnd}
					step="any"
					onChange={(value) => (renderEnd = value ?? renderEnd)}
				/></PropRow
			>
			<PropRow label="Frame rate"
				><PropNumber
					value={renderFps}
					min={1}
					max={240}
					step={1}
					onChange={(value) => (renderFps = value ?? 60)}
				/></PropRow
			>
			<PropRow label="Width"
				><PropNumber
					value={renderWidth}
					min={64}
					max={8192}
					step={1}
					onChange={(value) => (renderWidth = value ?? 1920)}
				/></PropRow
			>
			<PropRow label="Height"
				><PropNumber
					value={renderHeight}
					min={64}
					max={8192}
					step={1}
					onChange={(value) => (renderHeight = value ?? 1080)}
				/></PropRow
			>
			<PropRow label="Format"
				><PropSelect
					value={localProps.backgroundMode === 'transparent' ? 'prores4444' : renderFormat}
					options={formatOptions}
					onChange={(value) => {
						renderFormat = value as 'h264' | 'prores4444';
						if (renderFormat === 'h264') renderTransparent = false;
					}}
				/></PropRow
			>
			<PropRow label="Transparent"
				><PropCheckbox
					checked={renderTransparent || localProps.backgroundMode === 'transparent'}
					disabled={localProps.backgroundMode === 'transparent'}
					label="Use transparent canvas (ProRes 4444)"
					onChange={(value) => {
						renderTransparent = value;
						if (value) renderFormat = 'prores4444';
					}}
				/></PropRow
			>
			<button type="button" class="render-button" disabled={renderBusy} onclick={renderLayout}
				>{renderBusy ? 'Rendering…' : 'Render video'}</button
			>
			{#if renderJob?.status === 'completed'}<a
					class="download"
					href={renderDownloadUrl(renderJob.id)}
					download>Download {renderJob.spec.format === 'prores4444' ? 'ProRes' : 'H.264'} video</a
				>{/if}
			{#if renderJob?.status === 'queued' || renderJob?.status === 'running'}<div
					class="render-status"
				>
					Render job {renderJob.status}…
				</div>{/if}
			{#if renderError}<div class="render-error">{renderError}</div>{/if}
		</PropSection>
	{/if}
</div>

<style>
	.grid-layout-props {
		display: flex;
		flex-direction: column;
	}
	.render-button {
		margin: 0.25rem 0.75rem 0.45rem;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--mcs-accent);
		background: var(--mcs-accent);
		color: var(--mcs-bg, #f5f5f5);
		border-radius: var(--mcs-radius, 0.25rem);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 650;
		cursor: pointer;
	}
	.render-button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.download {
		display: block;
		margin: 0 0.75rem 0.45rem;
		color: var(--mcs-accent);
		font-size: 0.75rem;
	}
	.render-status,
	.render-error {
		margin: 0 0.75rem 0.45rem;
		color: var(--mcs-text-muted);
		font-size: 0.72rem;
		overflow-wrap: anywhere;
		max-height: 7rem;
		overflow: auto;
	}
	.render-error {
		color: var(--mcs-danger, #222222);
	}
</style>
