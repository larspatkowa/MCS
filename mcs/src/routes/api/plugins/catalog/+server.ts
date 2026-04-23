import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildPluginCatalog } from '$lib/server/plugin-contract';

export const GET: RequestHandler = async () => {
	return json(buildPluginCatalog());
};
