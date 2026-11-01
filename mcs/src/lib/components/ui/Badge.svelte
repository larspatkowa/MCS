<script lang="ts">
	import type { Snippet } from 'svelte';

	type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
	let {
		children,
		tone = 'neutral',
		class: className = ''
	}: { children?: Snippet; tone?: BadgeTone; class?: string } = $props();
</script>

<span class="mcs-badge mcs-badge-{tone} {className}">{@render children?.()}</span>

<style>
	.mcs-badge {
		display: inline-flex;
		align-items: center;
		min-height: 1.3rem;
		padding: 0 0.4rem;
		border: 1px solid var(--mcs-border);
		border-radius: 0;
		font: 400 0.68rem/1 var(--mcs-font-mono);
	}
	.mcs-badge-neutral {
		color: var(--mcs-text-muted);
		background: transparent;
	}
	.mcs-badge-info {
		color: var(--mcs-text);
	}
	.mcs-badge-success {
		color: var(--mcs-success);
	}
	.mcs-badge-warning {
		color: var(--mcs-warning);
	}
	.mcs-badge-danger {
		color: var(--mcs-danger);
	}
</style>
