import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAvailablePlugins } from '$lib/server/plugins-config';

export const GET: RequestHandler = async () => {
	const plugins = getAvailablePlugins();
	return json({ plugins });
};
