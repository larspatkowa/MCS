import { writable } from 'svelte/store';

/** True while the user is dragging an object from the tree (mcs-object-id). */
export const isDraggingObject = writable(false);

/** Parent id of the node being dragged; set on dragstart, cleared on dragend. Used for tree reorder drop targets. */
export const dragParentId = writable<string | null>(null);
