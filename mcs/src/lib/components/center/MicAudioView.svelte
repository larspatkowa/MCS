<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Mic, MicOff, Activity, BarChart2 } from '@lucide/svelte';
	import ErrorBoundary from '../ErrorBoundary.svelte';
	import { untrack } from 'svelte';

	let { objectId = '', props = {} } = $props<{
		objectId?: string;
		props?: { label?: string; fftSize?: number };
	}>();

	// ── Config ────────────────────────────────────────────────────────────────
	const FFT_SIZE = untrack(() => props.fftSize ?? 256); // bins = FFT_SIZE / 2
	const BAR_COUNT = FFT_SIZE / 2;

	// ── State ─────────────────────────────────────────────────────────────────
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let stream = $state<MediaStream | null>(null);
	let audioCtx = $state<AudioContext | null>(null);
	let analyser = $state<AnalyserNode | null>(null);
	let active = $state(false);
	let error = $state<string | null>(null);
	let mode = $state<'spectrum' | 'waveform'>('spectrum');
	let rafId = $state(0);
	let dbData = new Uint8Array(BAR_COUNT);
	let waveData = new Uint8Array(FFT_SIZE);

	// ── Draw loop ─────────────────────────────────────────────────────────────
	function draw() {
		if (!canvasEl || !analyser) return;
		rafId = requestAnimationFrame(draw);

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const W = canvasEl.width;
		const H = canvasEl.height;

		ctx.clearRect(0, 0, W, H);
		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, W, H);

		if (mode === 'spectrum') {
			analyser.getByteFrequencyData(dbData);
			const barW = W / BAR_COUNT;
			for (let i = 0; i < BAR_COUNT; i++) {
				const barH = (dbData[i] / 255) * H;
				// Colour: blue→cyan→green gradient across freq
				const hue = 180 + (i / BAR_COUNT) * 60; // 180–240
				ctx.fillStyle = `hsl(${hue},80%,55%)`;
				ctx.fillRect(i * barW, H - barH, Math.max(barW - 1, 1), barH);
			}
		} else {
			// Waveform
			analyser.getByteTimeDomainData(waveData);
			ctx.strokeStyle = '#4f9cf9';
			ctx.lineWidth = 2;
			ctx.beginPath();
			const sliceW = W / FFT_SIZE;
			for (let i = 0; i < FFT_SIZE; i++) {
				const y = (waveData[i] / 128 - 1) * (H / 2) + H / 2;
				if (i === 0) ctx.moveTo(0, y);
				else ctx.lineTo(i * sliceW, y);
			}
			ctx.stroke();
		}
	}

	// ── Mic control ───────────────────────────────────────────────────────────
	async function startMic() {
		error = null;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
			audioCtx = new AudioContext();
			analyser = audioCtx.createAnalyser();
			analyser.fftSize = FFT_SIZE * 2; // fftSize must be >= 2 * frequencyBinCount
			analyser.smoothingTimeConstant = 0.75;
			dbData = new Uint8Array(analyser.frequencyBinCount);
			waveData = new Uint8Array(analyser.fftSize);

			const source = audioCtx.createMediaStreamSource(stream);
			source.connect(analyser);
			active = true;
			draw();
		} catch (e) {
			if (e instanceof Error) {
				if (e.name === 'NotAllowedError')
					error = 'Microphone access denied. Allow access and try again.';
				else if (e.name === 'NotFoundError') error = 'No microphone found.';
				else error = `Mic error: ${e.message}`;
			}
			active = false;
		}
	}

	function stopMic() {
		cancelAnimationFrame(rafId);
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
		if (audioCtx) {
			audioCtx.close().catch(() => {});
			audioCtx = null;
		}
		analyser = null;
		active = false;
		if (canvasEl) {
			const ctx2 = canvasEl.getContext('2d');
			if (ctx2) {
				ctx2.fillStyle = '#0a0a0a';
				ctx2.fillRect(0, 0, canvasEl.width, canvasEl.height);
			}
		}
	}

	function toggle() {
		if (active) stopMic();
		else void startMic();
	}

	// ── Resize canvas to match container ─────────────────────────────────────
	let resizeObs: ResizeObserver | null = null;
	onMount(() => {
		if (canvasEl) {
			resizeObs = new ResizeObserver(() => {
				if (!canvasEl) return;
				canvasEl.width = canvasEl.clientWidth;
				canvasEl.height = canvasEl.clientHeight;
			});
			resizeObs.observe(canvasEl);
		}
	});

	onDestroy(() => {
		stopMic();
		resizeObs?.disconnect();
	});
</script>

<div class="mic-root">
	<ErrorBoundary>
		<canvas bind:this={canvasEl} class="display" class:visible={active}></canvas>

		{#if !active}
			<div class="overlay">
				{#if error}
					<div class="status error">
						<MicOff size={32} />
						<span>{error}</span>
						<button class="btn" onclick={toggle}>Try Again</button>
					</div>
				{:else}
					<div class="status idle">
						<Mic size={40} />
						<span class="label">{props.label ?? 'Microphone Audio'}</span>
						<button class="btn primary" onclick={toggle}>Start Mic</button>
					</div>
				{/if}
			</div>
		{/if}

		{#if active}
			<div class="controls">
				<button
					class="ctrl-btn"
					class:active-mode={mode === 'spectrum'}
					onclick={() => (mode = 'spectrum')}
					title="Frequency spectrum"
				>
					<BarChart2 size={14} />
				</button>
				<button
					class="ctrl-btn"
					class:active-mode={mode === 'waveform'}
					onclick={() => (mode = 'waveform')}
					title="Waveform"
				>
					<Activity size={14} />
				</button>
				<span class="spacer"></span>
				<button class="ctrl-btn stop" onclick={toggle} title="Stop mic">
					<MicOff size={14} />
				</button>
			</div>
		{/if}
	</ErrorBoundary>
</div>

<style>
	.mic-root {
		position: relative;
		width: 100%;
		height: 100%;
		background: #0a0a0a;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.display {
		width: 100%;
		height: 100%;
		display: none;
	}

	.display.visible {
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

	.controls {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 10px;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
		opacity: 0;
		transition: opacity 0.2s;
	}

	.mic-root:hover .controls {
		opacity: 1;
	}

	.ctrl-btn {
		padding: 4px 7px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(0, 0, 0, 0.4);
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.ctrl-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
	}
	.ctrl-btn.active-mode {
		background: rgba(79, 156, 249, 0.3);
		color: #4f9cf9;
		border-color: rgba(79, 156, 249, 0.4);
	}
	.ctrl-btn.stop:hover {
		background: rgba(239, 68, 68, 0.25);
		color: #ef4444;
	}

	.spacer {
		flex: 1;
	}
</style>
