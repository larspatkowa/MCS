import type { MCSObject } from '$lib/objects/types.js';

let galleryObjects: Map<string, MCSObject> = new Map();

export function setGalleryObjects(map: Map<string, MCSObject>): void {
	galleryObjects = map;
}

export function clearGalleryObjects(): void {
	galleryObjects = new Map();
}

export function getGalleryObject(objectId: string): MCSObject | null {
	return galleryObjects.get(objectId) ?? null;
}
