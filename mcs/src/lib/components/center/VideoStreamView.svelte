<script lang="ts">
	import { currentProject } from '$lib/stores/project.js';
	import { replayClock } from '$lib/stores/replay-session.js';

	let { props } = $props<{ props: Record<string, unknown> }>();
	let videoEl = $state<HTMLVideoElement | null>(null);
	let asset = $state<{
		id: string;
		sourceName: string;
		mimeType: string;
		durationUs: number | null;
	} | null>(null);
	let binding = $state<{
		offsetUs: number;
		rate: number;
		metadata?: Record<string, unknown>;
		anchors: { mediaTimeUs: number; runTimeUs: number }[];
	} | null>(null);
	let error = $state<string | null>(null);
	let loading = $state(false);

	const assetId = $derived(typeof props.assetId === 'string' ? props.assetId : '');
	const requestedRunId = $derived(typeof props.runId === 'string' ? props.runId : '');
	const runId = $derived(requestedRunId || $replayClock.runId || '');
	const muted = $derived(props.muted !== false);
	const autoplay = $derived(props.autoplay !== false);
	const controls = $derived(props.controls !== false);
	const fit = $derived(props.fit === 'cover' ? 'cover' : 'contain');
	const volume = $derived(
		typeof props.volume === 'number' ? Math.max(0, Math.min(1, props.volume)) : 1
	);
	const sourceUrl = $derived(
		asset && $currentProject
			? `/api/projects/${encodeURIComponent($currentProject.id)}/media/${encodeURIComponent(asset.id)}/file`
			: ''
	);
	const trackStartUs = $derived(
		typeof binding?.metadata?.startUs === 'number' && Number.isFinite(binding.metadata.startUs)
			? binding.metadata.startUs
			: 0
	);

	$effect(() => {
		const project = $currentProject;
		if (!project || !assetId) {
			asset = null;
			binding = null;
			return;
		}
		const controller = new AbortController();
		void loadMedia(project.id, assetId, runId, controller.signal);
		return () => controller.abort();
	});

	$effect(() => {
		if (!videoEl) return;
		videoEl.muted = muted;
		videoEl.volume = volume;
	});

	$effect(() => {
		const clock = $replayClock;
		if (!videoEl || !sourceUrl || (clock.mode !== 'replay' && clock.mode !== 'render')) return;
		const mapped = mapRunTimeToMedia(clock.playhead * 1_000_000);
		const elapsed = mapped - trackStartUs;
		const available =
			Number.isFinite(elapsed) &&
			elapsed >= 0 &&
			(asset?.durationUs == null || elapsed <= asset.durationUs);
		if (!available) {
			videoEl.pause();
			return;
		}
		const target = Math.max(0, elapsed / 1_000_000);
		if (Math.abs(videoEl.currentTime - target) > 0.08) {
			try {
				videoEl.currentTime = target;
			} catch {
				/* metadata may not be loaded yet */
			}
		}
		if (clock.playing) void videoEl.play().catch(() => undefined);
		else videoEl.pause();
	});

	async function loadMedia(
		projectId: string,
		id: string,
		selectedRunId: string,
		signal: AbortSignal
	): Promise<void> {
		loading = true;
		error = null;
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/media/${encodeURIComponent(id)}`,
				{ signal }
			);
			if (!response.ok)
				throw new Error((await response.json())?.error ?? 'Unable to load media asset');
			const body = await response.json();
			asset = body.asset;
			binding = null;
			if (selectedRunId) {
				const bindingsResponse = await fetch(
					`/api/projects/${encodeURIComponent(projectId)}/media/bindings?runId=${encodeURIComponent(selectedRunId)}`,
					{ signal }
				);
				if (bindingsResponse.ok) {
					const bindings = (await bindingsResponse.json()).bindings as Array<{
						assetId: string;
						offsetUs: number;
						rate: number;
						metadata?: Record<string, unknown>;
						anchors: { mediaTimeUs: number; runTimeUs: number }[];
					}>;
					binding = bindings.find((candidate) => candidate.assetId === id) ?? null;
				}
			}
		} catch (reason) {
			if (!signal.aborted) error = reason instanceof Error ? reason.message : String(reason);
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	function mapRunTimeToMedia(runTimeUs: number): number {
		if (!binding || binding.anchors.length === 0)
			return (runTimeUs - (binding?.offsetUs ?? 0)) / (binding?.rate ?? 1);
		const anchors = [...binding.anchors].sort((a, b) => a.runTimeUs - b.runTimeUs);
		if (anchors.length === 1)
			return anchors[0].mediaTimeUs + (runTimeUs - anchors[0].runTimeUs) / (binding.rate || 1);
		let left = anchors[0];
		let right = anchors[1];
		if (runTimeUs >= anchors.at(-1)!.runTimeUs) {
			left = anchors.at(-2)!;
			right = anchors.at(-1)!;
		} else if (runTimeUs > anchors[0].runTimeUs) {
			for (let index = 1; index < anchors.length; index += 1) {
				if (runTimeUs <= anchors[index].runTimeUs) {
					left = anchors[index - 1];
					right = anchors[index];
					break;
				}
			}
		}
		const denominator = right.runTimeUs - left.runTimeUs;
		return denominator === 0
			? left.mediaTimeUs
			: left.mediaTimeUs +
					((runTimeUs - left.runTimeUs) * (right.mediaTimeUs - left.mediaTimeUs)) / denominator;
	}
</script>

<div class="video-view" aria-label={asset?.sourceName ?? 'Video stream'}>
	{#if loading}
		<div class="state">Loading video…</div>
	{:else if error}
		<div class="state error">{error}</div>
	{:else if !assetId}
		<div class="state">Choose a project media asset in Properties.</div>
	{:else if sourceUrl}
		<video
			bind:this={videoEl}
			src={sourceUrl}
			{controls}
			{autoplay}
			{muted}
			playsinline
			preload="metadata"
			style={`object-fit:${fit}`}
		></video>
		{#if props.showOverlay !== false}<div class="overlay">
				<span>{asset?.sourceName}</span>{#if $replayClock.mode !== 'live'}<span class="clock"
						>T {Math.max(0, $replayClock.playhead).toFixed(3)}s</span
					>{/if}
			</div>{/if}
	{:else}
		<div class="state">Video unavailable.</div>
	{/if}
</div>

<style>
	.video-view {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 180px;
		overflow: hidden;
		background: var(--mcs-bg, #1a1a1a);
	}
	video {
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
	.overlay {
		position: absolute;
		inset: auto 0.6rem 0.55rem;
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		pointer-events: none;
		color: var(--mcs-text);
		font: 0.68rem var(--mcs-font-mono, monospace);
		text-shadow: none;
	}
	.clock {
		color: var(--mcs-text, #e5e5e5);
	}
</style>
