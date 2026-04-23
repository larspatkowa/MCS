<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { currentProject, selectedObjectId } from '$lib/stores/project';
	import { startTutorial } from '$lib/stores/tutorial';
	import { parseTutorialExampleKind } from '$lib/tutorial-kinds.js';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import type { CurrentProject } from '$lib/stores/project';

	let project = $state<CurrentProject | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let lastProjectId = $state<string | null>(null);
	let autoStartedProjectId = $state<string | null>(null);

	async function navigateToNewestFolder(projectId: string) {
		// Allow plugin scaffolding to finish and explorer polling to catch up.
		await new Promise((r) => setTimeout(r, 650));
		// Import lazily to avoid doing tree work during SSR.
		const { refreshExplorerTree } = await import('$lib/stores/explorerTree');
		await refreshExplorerTree();

		const objRes = await fetch(`/api/projects/${projectId}/objects`);
		if (!objRes.ok) return;
		const tree = (await objRes.json()) as {
			children?: { id: string; type: string; name: string; createdAt: string }[];
		};
		const cutoff = Date.now() - 10_000;
		const newFolder = (tree.children ?? [])
			.slice()
			.reverse()
			.find((c) => c.type === 'folder' && new Date(c.createdAt).getTime() > cutoff);
		if (newFolder) {
			await goto(`?object=${newFolder.id}`);
		}
	}

	$effect(() => {
		const projectId = $page.params.id ?? null;
		const objectId = $page.url.searchParams.get('object') || null;
		const selectionId = objectId ?? projectId;

		// In agri-static demo mode, there is no real /project/:id route.
		// Some UI actions may still navigate here; bounce back to the demo entry.
		if (false) {
			if (browser && projectId === 'demo-agri') {
				void goto(`/?object=${encodeURIComponent(`demo-layout`)}`, {
					replaceState: true,
					noScroll: true,
					keepFocus: true
				});
			}
			return;
		}

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
			autoStartedProjectId = null;
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
						goto('/');
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
							autoStartPlugins?: string[];
							tutorialExampleKind?: string;
					  }
					| undefined;
				const tutorialKind = parseTutorialExampleKind(s?.tutorialExampleKind);
				const isTutorialExample = tutorialKind !== null;
				project = {
					id: data.id,
					name: data.name,
					path: data.path,
					settings: s
						? {
								dateTime: s.dateTime,
								autoStartPlugins: s.autoStartPlugins,
								...(tutorialKind ? { tutorialExampleKind: tutorialKind } : {})
							}
						: undefined
				};
				currentProject.set(project);
				selectedObjectId.set(selectionId);

				if (browser && $page.url.searchParams.get('startTour') === '1') {
					const params = new URLSearchParams($page.url.searchParams);
					params.delete('startTour');
					const q = params.toString();
					void goto(`${$page.url.pathname}${q ? `?${q}` : ''}`, {
						replaceState: true,
						noScroll: true
					});
					startTutorial({ exampleKind: tutorialKind ?? null });
				}

				// Auto-start plugins configured for this project
				const autoStart: string[] = data.settings?.autoStartPlugins ?? [];
				if (autoStart.length > 0 && autoStartedProjectId !== data.id) {
					autoStartedProjectId = data.id;
					Promise.allSettled(
						autoStart.map((pluginId) =>
							fetch('/api/plugins/start', {
								method: 'POST',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ id: pluginId, projectId: data.id })
							})
						)
					)
						.then(async (results) => {
							// If any plugin actually started (vs already running), it likely scaffolded objects.
							// Navigate into the newest demo folder so the project doesn't look empty.
							let startedSomething = false;
							for (const res of results) {
								if (res.status !== 'fulfilled') continue;
								try {
									const payload = (await res.value.clone().json()) as { alreadyRunning?: boolean };
									if (!payload.alreadyRunning) startedSomething = true;
								} catch {
									// If we can't decode the response, assume it started (safe: just refresh).
									startedSomething = true;
								}
							}
							if (startedSomething && browser) {
								const hasExplicitObject = $page.url.searchParams.get('object') !== null;
								// Example projects should stay on the project root on load (no auto-jump).
								if (!isTutorialExample && !hasExplicitObject) {
									await navigateToNewestFolder(data.id);
								}
							}
						})
						.catch(() => {
							/* silent; plugin may already be running */
						});
				}
			})
			.catch((e) => {
				error = e.message ?? 'Failed to load project';
				currentProject.set(null);
				selectedObjectId.set(null);
				project = null;
				autoStartedProjectId = null;
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
		<button type="button" onclick={() => goto('/')}>Back to projects</button>
	</div>
{:else if project}
	<AppShell />
{:else}
	<div class="error">
		<p>Project not found</p>
		<button type="button" onclick={() => goto('/')}>Back to projects</button>
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
