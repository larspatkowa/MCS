import type { MCSObject } from '$lib/objects/types.js';

export interface GalleryVariantResult {
	rootId: string;
	objects: Map<string, MCSObject>;
}

export interface GalleryCatalogEntry {
	typeId: string;
	variantId: string;
	label?: string;
	buildObjects: () => GalleryVariantResult;
}
