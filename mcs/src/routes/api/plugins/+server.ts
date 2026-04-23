import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRunningPlugins } from '$lib/server/plugin-runner';
import { getRunningInProcess } from '$lib/server/plugin-registry';

export const GET: RequestHandler = async () => {
	const outOfProcess = getRunningPlugins();
	const inProcess = getRunningInProcess();
	const running = [
		...outOfProcess.map(({ id, pid }) => ({ id, status: 'running' as const, pid })),
		...inProcess.map(({ id, pid }) => ({ id, status: 'running' as const, pid }))
	];
	return json(running);
};
