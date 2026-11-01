<script lang="ts">
	import { currentProject } from '$lib/stores/project.js';

	let { props } = $props<{ props: Record<string, unknown> }>();
	let asset = $state<{ id: string; sourceName: string; mimeType: string } | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(false);

	const assetId = $derived(typeof props.assetId === 'string' ? props.assetId : '');
	const fit = $derived(props.fit === 'cover' ? 'cover' : 'contain');
	const label = $derived(
		typeof props.label === 'string' && props.label.trim() ? props.label.trim() : 'Image'
	);
	const sourceUrl = $derived(
		asset && $currentProject
			? `/api/projects/${encodeURIComponent($currentProject.id)}/media/${encodeURIComponent(asset.id)}/file`
			: ''
	);

	$effect(() => {
		const project = $currentProject;
		if (!project || !assetId) {
			asset = null;
			error = null;
			loading = false;
			return;
		}

		const controller = new AbortController();
		loading = true;
		error = null;
		asset = null;
		void loadAsset(project.id, assetId, controller.signal);
		return () => controller.abort();
	});

	async function loadAsset(projectId: string, id: string, signal: AbortSignal): Promise<void> {
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(id)}`,
				{ signal }
			);
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.error ?? 'Unable to load image asset');
			}
			const body = (await response.json()) as {
				asset?: { id: string; sourceName: string; mimeType: string };
			};
			if (!body.asset || !body.asset.mimeType.startsWith('image/')) {
				throw new Error('The selected media asset is not an image.');
			}
			if (!signal.aborted) asset = body.asset;
		} catch (reason) {
			if (!signal.aborted)
				error = reason instanceof Error ? reason.message : 'Unable to load image';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}
</script>

<div class="image-view" aria-label={label}>
	{#if loading}
		<div class="state">Loading image…</div>
	{:else if error}
		<div class="state error">{error}</div>
	{:else if !assetId}
		<div class="state">Choose an image asset in Properties.</div>
	{:else if sourceUrl}
		<img
			src={sourceUrl}
			alt={label}
			style={`object-fit:${fit}`}
			onerror={() => (error = 'Image could not be loaded from the project.')}
		/>
	{:else}
		<div class="state">Image unavailable.</div>
	{/if}
</div>

<style>
	.image-view {
		width: 100%;
		height: 100%;
		min-height: 180px;
		overflow: hidden;
		background: var(--mcs-bg, #1a1a1a);
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		background: var(--mcs-bg, #1a1a1a);
	}
	.state {
		display: grid;
		place-items: center;
		height: 100%;
		min-height: 180px;
		padding: 1rem;
		color: var(--mcs-text-muted);
		font-size: 0.8rem;
		text-align: center;
	}
	.state.error {
		color: var(--mcs-danger, #222222);
	}
</style>
