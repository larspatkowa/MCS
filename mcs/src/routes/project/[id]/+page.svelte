<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { currentProject, selectedObjectId } from '$lib/stores/project';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import type { CurrentProject } from '$lib/stores/project';

	let project = $state<CurrentProject | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let lastProjectId = $state<string | null>(null);

	$effect(() => {
		const projectId = $page.params.id ?? null;
		const objectId = $page.url.searchParams.get('object') || null;
		const selectionId = objectId ?? projectId;

		// Only reload if project ID changed
		if (projectId === lastProjectId && project) {
			// Project ID unchanged and project already loaded, just update object selection
			selectedObjectId.set(selectionId);
			return;
		}

		lastProjectId = projectId;

		if (!projectId) {
			loading = false;
			error = 'No project ID provided';
			currentProject.set(null);
			selectedObjectId.set(null);
			project = null;
			return;
		}

		loading = true;
		error = null;
		project = null;

		fetch(`/api/projects/${projectId}`)
			.then(async (r) => {
				const data = await r.json().catch(() => ({}));
				if (!r.ok) {
					// If project not found (404), redirect to home page
					if (r.status === 404) {
						goto('/projects');
						return null;
					}
					const msg = typeof data?.error === 'string' ? data.error : 'Failed to load project';
					throw new Error(msg);
				}
				return data;
			})
			.then((data) => {
				// If redirected (404 case), data will be null
				if (!data) return;

				if (data.error) {
					throw new Error(data.error);
				}
				const s = data.settings as
					| {
							dateTime?: { dateFormat?: string; timeFormat?: string };
							minimalUi?: boolean;
					  }
					| undefined;
				project = {
					id: data.id,
					name: data.name,
					path: data.path,
					settings: s
						? {
								dateTime: s.dateTime,
								minimalUi: s.minimalUi
							}
						: undefined
				};
				currentProject.set(project);
				selectedObjectId.set(selectionId);
			})
			.catch((e) => {
				error = e.message ?? 'Failed to load project';
				currentProject.set(null);
				selectedObjectId.set(null);
				project = null;
			})
			.finally(() => {
				loading = false;
			});
	});
</script>

<svelte:head>
	<title>{project ? `${project.name} | MCS` : 'MCS'}</title>
</svelte:head>

{#if loading}
	<div class="loading">Loading project...</div>
{:else if error}
	<div class="error">
		<p>{error}</p>
		<button type="button" onclick={() => goto('/projects')}>Back to projects</button>
	</div>
{:else if project}
	<AppShell />
{:else}
	<div class="error">
		<p>Project not found</p>
		<button type="button" onclick={() => goto('/projects')}>Back to projects</button>
	</div>
{/if}

<style>
	.loading,
	.error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 1rem;
		color: var(--mcs-text);
	}
	.error p {
		margin: 0;
		color: var(--mcs-accent);
	}
	.error button {
		padding: 0.5rem 1rem;
		background: var(--mcs-surface-alt);
		border: 1px solid var(--mcs-border);
		color: var(--mcs-text);
		border-radius: 2px;
		cursor: pointer;
	}
	.error button:hover {
		background: var(--mcs-surface);
	}
</style>
