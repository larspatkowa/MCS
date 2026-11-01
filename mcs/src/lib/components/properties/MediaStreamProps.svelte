<script lang="ts">
	import type { MCSObject } from '$lib/objects/types.js';
	import { currentProject, invalidateSelectedObject } from '$lib/stores/project.js';
	import PropCheckbox from './PropCheckbox.svelte';
	import PropNumber from './PropNumber.svelte';
	import PropRow from './PropRow.svelte';
	import PropSection from './PropSection.svelte';
	import PropSelect from './PropSelect.svelte';
	import PropText from './PropText.svelte';

	interface AssetOption {
		id: string;
		sourceName: string;
		mimeType: string;
		byteSize: number;
		durationUs: number | null;
	}

	interface RunOption {
		id: string;
		status: string;
		startedAt: number;
		endedAt: number | null;
	}

	let { object } = $props<{ object: MCSObject }>();
	let localProps = $state<Record<string, unknown>>({});
	let assets = $state<AssetOption[]>([]);
	let runs = $state<RunOption[]>([]);
	let loading = $state(false);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	const isImage = $derived(object.type === 'image');

	$effect(() => {
		localProps = { ...(object.props ?? {}) };
	});

	$effect(() => {
		const project = $currentProject;
		if (!project) return;
		const controller = new AbortController();
		loading = true;
		Promise.all([
			fetch(`/api/projects/${encodeURIComponent(project.id)}/media`, {
				signal: controller.signal
			}).then((response) => (response.ok ? response.json() : { assets: [] })),
			fetch(`/api/projects/${encodeURIComponent(project.id)}/runs?limit=200`, {
				signal: controller.signal
			}).then((response) => (response.ok ? response.json() : { runs: [] }))
		])
			.then(([media, runPayload]) => {
				assets = Array.isArray(media.assets) ? media.assets : [];
				runs = Array.isArray(runPayload.runs) ? runPayload.runs : [];
			})
			.catch((reason) => {
				if (!controller.signal.aborted)
					error = reason instanceof Error ? reason.message : String(reason);
			})
			.finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	const compatibleAssets = $derived(
		assets.filter((asset) =>
			isImage ? asset.mimeType.startsWith('image/') : !asset.mimeType.startsWith('image/')
		)
	);
	const assetOptions = $derived([
		{ value: '', label: '(choose a project media asset)' },
		...compatibleAssets.map((asset) => ({
			value: asset.id,
			label: `${asset.sourceName} · ${formatBytes(asset.byteSize)}`
		}))
	]);
	const runOptions = $derived([
		{ value: '', label: '(use the active replay run)' },
		...runs.map((run) => ({
			value: run.id,
			label: `${new Date(run.startedAt * 1000).toLocaleString()} · ${run.status}`
		}))
	]);

	function formatBytes(bytes: number): string {
		if (!Number.isFinite(bytes) || bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function update(patch: Record<string, unknown>): Promise<void> {
		const project = $currentProject;
		if (!project) return;
		const next = { ...localProps, ...patch };
		localProps = next;
		error = null;
		const response = await fetch(
			`/api/projects/${encodeURIComponent(project.id)}/objects/${encodeURIComponent(object.id)}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ props: next, expectedUpdatedAt: object.updatedAt })
			}
		);
		if (response.ok || response.status === 409) invalidateSelectedObject();
		else
			error = (await response.json().catch(() => null))?.error ?? 'Unable to save media properties';
	}

	async function importMedia(event: Event): Promise<void> {
		const project = $currentProject;
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!project || !file || uploading) return;
		uploading = true;
		error = null;
		try {
			const form = new FormData();
			form.set('file', file);
			const selectedRunId = String(localProps.runId ?? '').trim();
			if (selectedRunId) form.set('runId', selectedRunId);
			const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}/media`, {
				method: 'POST',
				body: form
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) throw new Error(payload?.error ?? 'Unable to import media');
			const imported = payload?.asset as AssetOption | undefined;
			if (imported) {
				assets = [imported, ...assets.filter((asset) => asset.id !== imported.id)];
				await update({ assetId: imported.id });
			}
		} catch (reason) {
			error = reason instanceof Error ? reason.message : String(reason);
		} finally {
			uploading = false;
			input.value = '';
		}
	}
</script>

<div class="media-props">
	<PropSection title="Source" id="media-source" open={true}>
		<PropRow
			label="Media asset"
			tooltip="Project-owned media is content-addressed and safe to include in exports."
		>
			<PropSelect
				value={String(localProps.assetId ?? '')}
				options={assetOptions}
				onChange={(value) => void update({ assetId: value })}
			/>
		</PropRow>
		<PropRow
			label="Import file"
			tooltip="The file is copied into the project and deduplicated by content hash."
		>
			<label class="file-button">
				<span>{uploading ? 'Importing…' : isImage ? 'Choose image' : 'Choose video or audio'}</span>
				<input
					type="file"
					accept={isImage ? 'image/*' : 'video/*,audio/*'}
					disabled={uploading}
					onchange={importMedia}
				/>
			</label>
		</PropRow>
		{#if !isImage}
			<PropRow
				label="Replay run"
				tooltip="Leave blank to follow the currently selected replay run."
			>
				<PropSelect
					value={String(localProps.runId ?? '')}
					options={runOptions}
					onChange={(value) => void update({ runId: value })}
				/>
			</PropRow>
		{/if}
		{#if loading}<div class="hint">Loading project media and runs…</div>{/if}
		{#if assets.length === 0 && !loading}<div class="hint">
				Import an {isImage ? 'image' : 'video or audio'} file above, then choose it as the source.
			</div>{/if}
	</PropSection>

	<PropSection title={isImage ? 'Display' : 'Playback'} id="media-playback" open={true}>
		<PropRow label="Label"
			><PropText
				value={String(localProps.label ?? '')}
				onChange={(value) => void update({ label: value })}
			/></PropRow
		>
		<PropRow label="Fit"
			><PropSelect
				value={String(localProps.fit ?? 'contain')}
				options={[
					{ value: 'contain', label: 'Contain' },
					{ value: 'cover', label: 'Cover' }
				]}
				onChange={(value) => void update({ fit: value })}
			/></PropRow
		>
		{#if !isImage}
			<PropRow label="Volume"
				><PropNumber
					value={typeof localProps.volume === 'number' ? localProps.volume : 1}
					min={0}
					max={1}
					step={0.05}
					onChange={(value) => void update({ volume: value ?? 1 })}
				/></PropRow
			>
			<PropRow label="Muted"
				><PropCheckbox
					checked={localProps.muted !== false}
					onChange={(value) => void update({ muted: value })}
				/></PropRow
			>
			<PropRow label="Autoplay"
				><PropCheckbox
					checked={localProps.autoplay !== false}
					onChange={(value) => void update({ autoplay: value })}
				/></PropRow
			>
			<PropRow label="Native controls"
				><PropCheckbox
					checked={localProps.controls !== false}
					onChange={(value) => void update({ controls: value })}
				/></PropRow
			>
			<PropRow label="Replay overlay"
				><PropCheckbox
					checked={localProps.showOverlay !== false}
					onChange={(value) => void update({ showOverlay: value })}
				/></PropRow
			>
		{/if}
	</PropSection>

	{#if error}<div class="error">{error}</div>{/if}
</div>

<style>
	.media-props {
		display: flex;
		flex-direction: column;
	}
	.hint,
	.error {
		padding: 0.55rem 0.75rem;
		color: var(--mcs-text-muted);
		font-size: 0.75rem;
		line-height: 1.4;
	}
	.error {
		color: var(--mcs-danger, #222222);
	}
	.file-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 9rem;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--mcs-border, rgba(255, 255, 255, 0.14));
		border-radius: 0.3rem;
		background: rgba(255, 255, 255, 0.06);
		color: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.file-button input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
