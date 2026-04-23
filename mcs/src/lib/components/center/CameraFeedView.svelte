<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Camera, CameraOff, RefreshCw } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';
	import { untrack } from 'svelte';

	let { objectId = '', props = {} } = $props<{
		objectId?: string;
		props?: { deviceId?: string; label?: string };
	}>();

	// ── State ─────────────────────────────────────────────────────────────────
	let videoEl = $state<HTMLVideoElement | null>(null);
	let stream = $state<MediaStream | null>(null);
	let active = $state(false);
	let error = $state<string | null>(null);
	let devices = $state<MediaDeviceInfo[]>([]);
	let selectedId = $state(untrack(() => props.deviceId ?? ''));

	// ── Device enumeration ────────────────────────────────────────────────────
	async function loadDevices() {
		try {
			const all = await navigator.mediaDevices.enumerateDevices();
			devices = all.filter((d) => d.kind === 'videoinput');
		} catch {
			// Permissions not yet granted — devices may have no labels
			devices = [];
		}
	}

	// ── Start/stop camera ─────────────────────────────────────────────────────
	async function startCamera() {
		error = null;
		try {
			const constraints: MediaStreamConstraints = {
				video: selectedId ? { deviceId: { exact: selectedId } } : true,
				audio: false
			};
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			active = true;
			// After getting permission, re-enumerate to get labels
			await loadDevices();
			if (videoEl) {
				videoEl.srcObject = stream;
				videoEl.play().catch(() => {});
			}
		} catch (e) {
			if (e instanceof Error) {
				if (e.name === 'NotAllowedError')
					error = 'Camera access denied. Allow camera permission and try again.';
				else if (e.name === 'NotFoundError')
					error = 'No camera found. Make sure a camera is connected.';
				else error = `Camera error: ${e.message}`;
			}
			active = false;
		}
	}

	function stopCamera() {
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
		if (videoEl) videoEl.srcObject = null;
		active = false;
	}

	function toggle() {
		if (active) stopCamera();
		else void startCamera();
	}

	function switchDevice() {
		if (active) {
			stopCamera();
			void startCamera();
		}
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	onMount(() => {
		void loadDevices();
	});

	onDestroy(() => {
		stopCamera();
	});
</script>

<div class="camera-root">
	<ErrorBoundary>
		<!-- video element — always mounted so srcObject assignment works -->
		<!-- svelte-ignore a11y_media_has_caption -->
		<video bind:this={videoEl} class="feed" class:visible={active} autoplay playsinline muted
		></video>

		{#if !active}
			<div class="overlay">
				{#if error}
					<div class="status error">
						<CameraOff size={32} />
						<span>{error}</span>
						<button class="btn" onclick={toggle}>Try Again</button>
					</div>
				{:else}
					<div class="status idle">
						<Camera size={40} />
						<span class="label">{props.label ?? 'Camera Feed'}</span>
						<button class="btn primary" onclick={toggle}>Start Camera</button>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Controls bar at bottom when active -->
		{#if active}
			<div class="controls">
				{#if devices.length > 1}
					<select class="device-select" bind:value={selectedId} onchange={switchDevice}>
						{#each devices as dev}
							<option value={dev.deviceId}
								>{dev.label || `Camera ${dev.deviceId.slice(0, 8)}`}</option
							>
						{/each}
					</select>
				{/if}
				<button class="ctrl-btn" onclick={toggle} title="Stop camera">
					<CameraOff size={14} />
				</button>
				<button
					class="ctrl-btn"
					onclick={() => {
						stopCamera();
						void startCamera();
					}}
					title="Restart"
				>
					<RefreshCw size={14} />
				</button>
			</div>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.camera-root {
		position: relative;
		width: 100%;
		height: 100%;
		background: #0a0a0a;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.feed {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: none;
	}

	.feed.visible {
		display: block;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--mcs-text-muted, #888);
		text-align: center;
		padding: 24px;
	}

	.status.error {
		color: var(--mcs-color-danger, #ef4444);
	}

	.label {
		font-family: var(--mcs-font-sans, sans-serif);
		font-size: 13px;
		color: var(--mcs-text-muted, #888);
	}

	.btn {
		margin-top: 4px;
		padding: 6px 18px;
		border-radius: 6px;
		border: 1px solid var(--mcs-border, #333);
		background: var(--mcs-bg-raised, #1c1c1c);
		color: var(--mcs-text, #e8e8e8);
		font-size: 12px;
		cursor: pointer;
		font-family: var(--mcs-font-sans, sans-serif);
	}

	.btn:hover {
		background: var(--mcs-bg-hover, #252525);
	}

	.btn.primary {
		background: var(--mcs-accent, #4f9cf9);
		border-color: var(--mcs-accent, #4f9cf9);
		color: #fff;
	}

	.btn.primary:hover {
		filter: brightness(1.1);
	}

	/* Controls overlay at the bottom */
	.controls {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
		opacity: 0;
		transition: opacity 0.2s;
	}

	.camera-root:hover .controls {
		opacity: 1;
	}

	.device-select {
		flex: 1;
		padding: 3px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(0, 0, 0, 0.5);
		color: #e8e8e8;
		font-size: 11px;
		font-family: var(--mcs-font-sans, sans-serif);
		cursor: pointer;
	}

	.ctrl-btn {
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(0, 0, 0, 0.4);
		color: #e8e8e8;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.ctrl-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}
</style>
