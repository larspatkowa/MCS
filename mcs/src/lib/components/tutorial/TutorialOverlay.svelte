<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import {
		tutorial,
		getTutorialSteps,
		TUTORIAL_INGEST_STEP_INDEX,
		tutorialNext,
		tutorialPrev,
		endTutorial
	} from '$lib/stores/tutorial';
	import { currentProject } from '$lib/stores/project';
	import { sidebarLeftVisible } from '$lib/stores/sidebars';
	import { settingsModalOpen } from '$lib/stores/settings';

	const PAD = 0;

	let hole = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let cardPos = $state<{ top: number; left: number }>({ top: 0, left: 0 });
	let vw = $state(0);
	let vh = $state(0);
	let raf = 0;
	let tutorialOpenedSettings = $state(false);

	function layout() {
		if (typeof window === 'undefined') return;
		vw = window.innerWidth;
		vh = window.innerHeight;
		const st = get(tutorial);
		if (!st.active) {
			hole = null;
			return;
		}
		const steps = getTutorialSteps(st.exampleKind);
		const step = steps[st.step];
		const wantsSettingsOpen = step?.target === 'settings-btn';
		// Auto-open Settings on that step and auto-close when leaving it.
		if (wantsSettingsOpen) {
			if (!get(settingsModalOpen)) {
				settingsModalOpen.set(true);
				tutorialOpenedSettings = true;
			}
		} else if (tutorialOpenedSettings) {
			settingsModalOpen.set(false);
			tutorialOpenedSettings = false;
		}
		if (!step?.target) {
			hole = null;
			return;
		}
		// Ensure the Explorer is visible for sidebar steps.
		if (step.target === 'sidebar-tree') {
			sidebarLeftVisible.set(true);
		}
		const el = document.querySelector(`[data-tutorial="${step.target}"]`) as HTMLElement | null;
		if (!el) {
			hole = null;
			return;
		}
		el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
		const rect = el.getBoundingClientRect();
		hole = {
			top: Math.max(0, rect.top - PAD),
			left: Math.max(0, rect.left - PAD),
			width: rect.width + PAD * 2,
			height: rect.height + PAD * 2
		};
		const cardW = Math.min(360, vw - 24);
		const cardH = 280;
		let top: number;
		let left: number;

		if (step.target === 'sidebar-tree') {
			// Place the card to the side of the Explorer so it doesn't cover it.
			top = Math.max(16, Math.min(hole.top, vh - cardH - 16));
			const rightSide = hole.left + hole.width + 16;
			const leftSide = hole.left - cardW - 16;
			const canFitRight = rightSide + cardW <= vw - 16;
			left = canFitRight ? rightSide : leftSide;
			left = Math.max(16, Math.min(left, vw - cardW - 16));
		} else {
			top = hole.top + hole.height + 16;
			if (top + cardH > vh - 16) {
				top = hole.top - cardH - 16;
			}
			if (top < 16) top = 16;
			left = hole.left + hole.width / 2 - cardW / 2;
			left = Math.max(16, Math.min(left, vw - cardW - 16));
		}
		cardPos = { top, left };
	}

	function scheduleLayout() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			raf = requestAnimationFrame(layout);
		});
	}

	function onKeydown(e: KeyboardEvent) {
		if (!get(tutorial).active) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			endTutorial();
		}
	}

	let unsubTutorial: (() => void) | undefined;

	onMount(() => {
		unsubTutorial = tutorial.subscribe(() => {
			if (!get(tutorial).active) {
				hole = null;
				return;
			}
			scheduleLayout();
		});
		window.addEventListener('resize', scheduleLayout);
		window.addEventListener('scroll', scheduleLayout, true);
		scheduleLayout();

		return () => {
			unsubTutorial?.();
			window.removeEventListener('resize', scheduleLayout);
			window.removeEventListener('scroll', scheduleLayout, true);
			cancelAnimationFrame(raf);
		};
	});

	const ingestExample = $derived.by(() => {
		const id = $currentProject?.id ?? 'YOUR_PROJECT_ID';
		return `curl -X POST http://localhost:6000/api/ingest \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "${id}",
    "streamId": "tutorial:demo",
    "values": { "value": 42 }
  }'`;
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if $tutorial.active}
	{@const steps = getTutorialSteps($tutorial.exampleKind)}
	{@const stepDef = steps[$tutorial.step]}
	{@const lastStep = steps.length - 1}
	{@const stepCount = `${$tutorial.step + 1} / ${steps.length}`}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="tutorial-root" role="presentation">
		{#if hole}
			<div class="veil veil-top" style="height: {hole.top}px"></div>
			<div
				class="veil veil-bottom"
				style="top: {hole.top + hole.height}px; height: {Math.max(
					0,
					vh - hole.top - hole.height
				)}px; width: 100%"
			></div>
			<div
				class="veil veil-left"
				style="top: {hole.top}px; width: {hole.left}px; height: {hole.height}px"
			></div>
			<div
				class="veil veil-right"
				style="top: {hole.top}px; left: {hole.left + hole.width}px; width: {Math.max(
					0,
					vw - hole.left - hole.width
				)}px; height: {hole.height}px"
			></div>
		{:else}
			<div class="veil veil-full"></div>
		{/if}

		<div
			class="tutorial-card"
			class:card-centered={!hole}
			style={hole
				? `top: ${cardPos.top}px; left: ${cardPos.left}px; width: min(360px, calc(100vw - 24px))`
				: ''}
			role="dialog"
			aria-modal="true"
			aria-labelledby="tutorial-title"
		>
			<p class="card-step">Step {stepCount}</p>
			<h2 id="tutorial-title" class="card-title">{stepDef.title}</h2>
			<p class="card-body">{stepDef.body}</p>
			{#if $tutorial.step === TUTORIAL_INGEST_STEP_INDEX}
				<pre class="ingest-pre">{ingestExample}</pre>
			{/if}
			<div class="card-actions">
				<button type="button" class="btn btn-ghost" onclick={() => endTutorial()}>Close</button>
				<div class="card-actions-right">
					<button
						type="button"
						class="btn btn-secondary"
						disabled={$tutorial.step <= 0}
						onclick={() => tutorialPrev()}>Back</button
					>
					<button type="button" class="btn btn-primary" onclick={() => tutorialNext()}>
						{$tutorial.step >= lastStep ? 'Done' : 'Next'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.tutorial-root {
		position: fixed;
		inset: 0;
		/* Must sit above Settings/command palette overlays. */
		z-index: 4000;
		pointer-events: none;
	}
	.veil {
		position: fixed;
		background: rgba(0, 0, 0, 0.55);
		pointer-events: auto;
	}
	.veil-top {
		top: 0;
		left: 0;
		width: 100%;
	}
	.veil-bottom {
		left: 0;
	}
	.veil-left {
		left: 0;
	}
	.veil-right {
		position: fixed;
	}
	.veil-full {
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: auto;
	}
	.tutorial-card {
		position: fixed;
		z-index: 201;
		padding: 1rem 1.1rem 1.1rem;
		background: var(--mcs-surface);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		box-shadow: none;
		pointer-events: auto;
		max-height: min(70vh, 480px);
		overflow: auto;
	}
	.tutorial-card.card-centered {
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(400px, calc(100vw - 24px));
	}
	.card-step {
		margin: 0 0 0.45rem;
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--mcs-text-muted);
		font-family: var(--mcs-font-mono);
	}
	.card-title {
		margin: 0 0 0.5rem;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--mcs-text);
	}
	.card-body {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--mcs-text-muted);
	}
	.ingest-pre {
		margin: 0 0 0.75rem;
		padding: 0.6rem 0.65rem;
		font-size: 0.7rem;
		line-height: 1.35;
		overflow-x: auto;
		background: var(--mcs-bg);
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		color: var(--mcs-text);
		font-family: var(--mcs-font-mono);
		white-space: pre-wrap;
		word-break: break-all;
	}
	.card-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.card-actions-right {
		display: flex;
		gap: 0.4rem;
	}
	.btn {
		font-family: inherit;
		font-size: 0.8125rem;
		padding: 0.35rem 0.75rem;
		border-radius: 0;
		cursor: pointer;
		border: 1px solid var(--mcs-border);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn-primary {
		background: var(--mcs-accent);
		color: var(--mcs-bg);
		border-color: var(--mcs-accent);
	}
	.btn-secondary {
		background: var(--mcs-surface-alt);
		color: var(--mcs-text);
	}
	.btn-ghost {
		background: transparent;
		color: var(--mcs-text-muted);
		border-color: transparent;
	}
	.btn-ghost:hover {
		color: var(--mcs-text);
	}
	.btn-primary:hover,
	.btn-secondary:hover {
		filter: brightness(1.05);
	}
	.btn:focus-visible {
		outline: 2px solid var(--mcs-accent);
		outline-offset: 2px;
	}
</style>
