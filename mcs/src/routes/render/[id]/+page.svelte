<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import LazyView from '$lib/components/center/LazyView.svelte';
	import { currentProject } from '$lib/stores/project.js';
	import {
		configureRenderSession,
		seekReplay,
		setReplayPlaying
	} from '$lib/stores/replay-session.js';
	import { startRunReplay } from '$lib/stores/run.js';
	import { clearRenderContext, configureRenderContext } from '$lib/stores/render-context.js';

	let object = $state<{ id: string; type: string; props: Record<string, unknown> } | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let background = $state('#202020');
	let transparent = $state(false);

	onMount(() => {
		const projectId = $page.params.id ?? '';
		const objectId = $page.url.searchParams.get('objectId');
		const runId = $page.url.searchParams.get('runId');
		const start = Number($page.url.searchParams.get('start') ?? '0');
		const end = Number($page.url.searchParams.get('end') ?? '1');
		const fps = Number($page.url.searchParams.get('fps') ?? '60');
		background = $page.url.searchParams.get('background') || '#202020';
		transparent = $page.url.searchParams.get('transparent') === '1';
		(
			window as Window & {
				__mcsRenderSeek?: (time: number) => void | Promise<void>;
				__mcsRenderReady?: boolean;
			}
		).__mcsRenderSeek = async (time) => {
			if (runId) {
				seekReplay(time);
				setReplayPlaying(false);
			}
			// Let the shared replay store and Svelte views commit before a screenshot.
			await Promise.resolve();
		};
		(window as Window & { __mcsRenderReady?: boolean }).__mcsRenderReady = false;
		configureRenderContext({ background, transparent, showChrome: false });
		void prepare(projectId, objectId, runId, start, end, fps).then(() => {
			(window as Window & { __mcsRenderReady?: boolean }).__mcsRenderReady = true;
		});
		return () => {
			clearRenderContext();
			(
				window as Window & { __mcsRenderSeek?: unknown; __mcsRenderReady?: boolean }
			).__mcsRenderSeek = undefined;
		};
	});

	async function prepare(
		projectId: string,
		objectId: string | null,
		runId: string | null,
		requestedStart: number,
		requestedEnd: number,
		fps: number
	): Promise<void> {
		try {
			const replay = runId ? await startRunReplay(projectId, runId) : null;
			if (replay && runId) {
				const timestamps = replay.streams.flatMap((stream) =>
					stream.data.map((sample) => sample.timestamp)
				);
				const replayStart = timestamps.length ? Math.min(...timestamps) : requestedStart;
				const replayEnd = timestamps.length ? Math.max(...timestamps) : requestedEnd;
				configureRenderSession({
					projectId,
					runId,
					start: Math.max(requestedStart, replayStart),
					end: Math.min(Math.max(requestedEnd, replayStart + 0.001), replayEnd || requestedEnd),
					frameRate: fps
				});
			}
			await load(projectId, objectId);
		} catch (reason) {
			error = reason instanceof Error ? reason.message : String(reason);
			loading = false;
		}
	}

	async function load(projectId: string, objectId: string | null): Promise<void> {
		if (!objectId) {
			error = 'objectId is required';
			loading = false;
			return;
		}
		try {
			const [projectResponse, objectResponse] = await Promise.all([
				fetch(`/api/projects/${encodeURIComponent(projectId)}`),
				fetch(
					`/api/projects/${encodeURIComponent(projectId)}/objects/${encodeURIComponent(objectId)}`
				)
			]);
			if (!projectResponse.ok || !objectResponse.ok)
				throw new Error('Unable to load render target');
			const project = await projectResponse.json();
			object = await objectResponse.json();
			currentProject.set({
				id: project.id,
				name: project.name,
				path: project.path,
				settings: project.settings
			});
		} catch (reason) {
			error = reason instanceof Error ? reason.message : String(reason);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>MCS Render</title></svelte:head>

<div
	class="render-root"
	class:transparent
	style={`--render-background:${transparent ? 'transparent' : background}`}
>
	{#if loading}<div class="state">Preparing render…</div>
	{:else if error}<div class="state error">{error}</div>
	{:else if object}<LazyView typeId={object.type} objectId={object.id} props={object.props} />
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: transparent;
	}
	:global(body) {
		background: var(--render-background, #202020);
	}
	.render-root {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		background: var(--render-background, #202020);
	}
	.render-root.transparent {
		background: transparent;
	}
	.state {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		color: #cbd5e1;
		font: 14px system-ui;
	}
	.state.error {
		color: var(--mcs-danger, #222222);
	}
</style>
