import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getDefaultEntry } from '$lib/gallery/catalog.js';

export const load: PageLoad = () => {
	const entry = getDefaultEntry();
	throw redirect(302, `/gallery/${entry.typeId}/${entry.variantId}`);
};
