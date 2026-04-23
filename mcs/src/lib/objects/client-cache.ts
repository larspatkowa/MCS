import type { MCSObject, ObjectTreeNode } from './types.js';
import { getGalleryObject } from '$lib/gallery/resolver.js';

export type ProjectObject = MCSObject & { parentId?: string };

const CACHE_TTL_MS = 10_000;
const objectCache = new Map<string, { value: ProjectObject | null; cachedAt: number }>();
const inFlight = new Map<string, Promise<ProjectObject | null>>();

function cacheKey(projectId: string, objectId: string): string {
	return `${projectId}:${objectId}`;
}

function isFresh(entry: { cachedAt: number }): boolean {
	return Date.now() - entry.cachedAt < CACHE_TTL_MS;
}

function setCached(projectId: string, objectId: string, value: ProjectObject | null): void {
	objectCache.set(cacheKey(projectId, objectId), { value, cachedAt: Date.now() });
}

export function invalidateCachedObject(projectId: string, objectId: string): void {
	objectCache.delete(cacheKey(projectId, objectId));
	inFlight.delete(cacheKey(projectId, objectId));
}

export function clearProjectObjectCache(projectId?: string): void {
	if (!projectId) {
		objectCache.clear();
		inFlight.clear();
		return;
	}

	const prefix = `${projectId}:`;
	for (const key of objectCache.keys()) {
		if (key.startsWith(prefix)) objectCache.delete(key);
	}
	for (const key of inFlight.keys()) {
		if (key.startsWith(prefix)) inFlight.delete(key);
	}
}

export async function fetchProjectObject(
	projectId: string,
	objectId: string,
	options: { force?: boolean } = {}
): Promise<ProjectObject | null> {
	if (projectId === 'gallery') {
		const obj = getGalleryObject(objectId);
		return Promise.resolve(obj ? { ...obj, parentId: undefined } : null);
	}

	const key = cacheKey(projectId, objectId);
	if (!options.force) {
		const cached = objectCache.get(key);
		if (cached && isFresh(cached)) return cached.value;
	}

	const existing = inFlight.get(key);
	if (existing) return existing;

	const request = fetch(`/api/projects/${projectId}/objects/${objectId}`)
		.then(async (response) => {
			if (!response.ok) return null;
			const value = (await response.json()) as ProjectObject;
			setCached(projectId, objectId, value);
			return value;
		})
		.catch(() => null)
		.finally(() => {
			inFlight.delete(key);
		});

	inFlight.set(key, request);
	return request;
}

export function primeObjectCacheFromTree(projectId: string, root: ObjectTreeNode | null): void {
	if (!root) return;

	const visit = (node: ObjectTreeNode, parentId?: string) => {
		setCached(projectId, node.id, { ...node, parentId });
		for (const child of node.children ?? []) {
			visit(child, node.id);
		}
	};

	visit(root, undefined);
}
