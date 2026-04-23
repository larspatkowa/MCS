import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { getFirstVariantForType } from '$lib/gallery/catalog.js';

export const load: PageLoad = ({ params }) => {
	const entry = getFirstVariantForType(params.type);
	if (entry) {
		throw redirect(302, `/gallery/${entry.typeId}/${entry.variantId}`);
	}

	throw redirect(302, '/gallery');
};
