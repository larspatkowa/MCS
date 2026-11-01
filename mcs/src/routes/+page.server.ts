import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolveStartup } from '$lib/server/startup.js';

export const load: PageServerLoad = () => {
	const resolution = resolveStartup();
	if (resolution.kind === 'project') {
		throw redirect(307, `/project/${encodeURIComponent(resolution.projectId)}`);
	}
	return {
		defaultProjectUnavailable: Boolean(resolution.issue),
		defaultProjectIssue: resolution.issue
	};
};
