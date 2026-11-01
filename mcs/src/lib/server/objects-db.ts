import { randomUUID } from 'crypto';
import { getDb } from './db.js';
import type { ObjectTreeNode } from '$lib/objects';
import { rowToObject, type ObjectRow } from '$lib/objects';
import { BadRequestError } from './errors.js';

type ObjectFromRow = ReturnType<typeof rowToObject>;

export function getObjectTree(projectPath: string): ObjectTreeNode | null {
	const db = getDb(projectPath);
	const root = db.prepare('SELECT * FROM objects WHERE parent_id IS NULL LIMIT 1').get() as
		ObjectRow | undefined;
	if (!root) return null;
	return buildTree(db, rowToObject(root));
}

function buildTree(db: import('better-sqlite3').Database, obj: ObjectFromRow): ObjectTreeNode {
	const rows = db
		.prepare('SELECT * FROM objects WHERE parent_id = ? ORDER BY sort_order, created_at')
		.all(obj.id) as ObjectRow[];
	const children = rows.map((r) => buildTree(db, rowToObject(r)));
	return { ...obj, children };
}

export function getObject(
	projectPath: string,
	objectId: string
): (ObjectFromRow & { parentId?: string }) | null {
	const db = getDb(projectPath);
	const row = db.prepare('SELECT * FROM objects WHERE id = ?').get(objectId) as
		ObjectRow | undefined;
	if (!row) return null;
	const obj = rowToObject(row);
	return { ...obj, parentId: row.parent_id ?? undefined };
}

export function createObject(
	projectPath: string,
	params: {
		type: string;
		parentId: string;
		name: string;
		notes?: string;
		props?: Record<string, unknown>;
	}
): ReturnType<typeof rowToObject> {
	const db = getDb(projectPath);
	const id = randomUUID();
	const now = new Date().toISOString();
	const { type, parentId, notes = '', props = {} } = params;

	// Auto-increment name to avoid duplicate sibling names
	const siblingNames = new Set(
		(
			db.prepare('SELECT name FROM objects WHERE parent_id = ?').all(parentId) as { name: string }[]
		).map((r) => r.name)
	);
	let name = params.name;
	if (siblingNames.has(name)) {
		let counter = 2;
		while (siblingNames.has(`${params.name} ${counter}`)) counter++;
		name = `${params.name} ${counter}`;
	}

	const sortOrder =
		(
			db
				.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM objects WHERE parent_id = ?')
				.get(parentId) as { n: number }
		)?.n ?? 0;
	db.prepare(
		`INSERT INTO objects (id, type, parent_id, sort_order, name, notes, props, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(id, type, parentId, sortOrder, name, notes, JSON.stringify(props), now, now);
	const row = db.prepare('SELECT * FROM objects WHERE id = ?').get(id) as ObjectRow;
	return rowToObject(row);
}

export function updateObject(
	projectPath: string,
	objectId: string,
	updates: { name?: string; notes?: string; props?: Record<string, unknown> }
): void {
	const db = getDb(projectPath);
	const now = new Date().toISOString();
	const obj = getObject(projectPath, objectId);
	if (!obj) throw new Error('Object not found');
	const name = updates.name ?? obj.name;
	const notes = updates.notes ?? obj.notes;
	const props = updates.props ?? obj.props;
	db.prepare('UPDATE objects SET name = ?, notes = ?, props = ?, updated_at = ? WHERE id = ?').run(
		name,
		notes,
		JSON.stringify(props),
		now,
		objectId
	);
}

export function deleteObject(projectPath: string, objectId: string): void {
	const db = getDb(projectPath);
	const children = db.prepare('SELECT id FROM objects WHERE parent_id = ?').all(objectId) as {
		id: string;
	}[];
	for (const { id } of children) {
		deleteObject(projectPath, id);
	}
	db.prepare('DELETE FROM objects WHERE id = ?').run(objectId);
}

/**
 * Reorder children of a parent. childIds must be exactly the set of ids of current children in the desired order.
 */
export function reorderChildren(projectPath: string, parentId: string, childIds: string[]): void {
	const db = getDb(projectPath);
	const existing = db
		.prepare('SELECT id FROM objects WHERE parent_id = ? ORDER BY sort_order, created_at')
		.all(parentId) as { id: string }[];
	const existingIds = new Set(existing.map((r) => r.id));
	if (childIds.length !== existingIds.size || childIds.some((id) => !existingIds.has(id))) {
		throw new BadRequestError('childIds must match current children');
	}
	const now = new Date().toISOString();
	const stmt = db.prepare('UPDATE objects SET sort_order = ?, updated_at = ? WHERE id = ?');
	db.transaction(() => {
		childIds.forEach((id, index) => {
			stmt.run(index, now, id);
		});
	})();
}

/**
 * Move an object to a new parent (reparent). Optionally place before insertBeforeId.
 */
export function reparentObject(
	projectPath: string,
	objectId: string,
	newParentId: string,
	insertBeforeId?: string | null
): void {
	const db = getDb(projectPath);
	const now = new Date().toISOString();

	// Get current children of the new parent
	const siblings = db
		.prepare('SELECT id FROM objects WHERE parent_id = ? ORDER BY sort_order, created_at')
		.all(newParentId) as { id: string }[];
	const siblingIds = siblings.map((r) => r.id).filter((id) => id !== objectId);

	let sortOrder: number;
	if (insertBeforeId) {
		const idx = siblingIds.indexOf(insertBeforeId);
		sortOrder = idx >= 0 ? idx : siblingIds.length;
	} else {
		sortOrder = siblingIds.length;
	}

	// Update parent_id and sort_order
	db.prepare('UPDATE objects SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
		newParentId,
		sortOrder,
		now,
		objectId
	);

	// Reorder all siblings to maintain consistent sort_order
	const newSiblings = db
		.prepare('SELECT id FROM objects WHERE parent_id = ? ORDER BY sort_order, created_at')
		.all(newParentId) as { id: string }[];
	const reorderStmt = db.prepare('UPDATE objects SET sort_order = ? WHERE id = ?');
	newSiblings.forEach((row, index) => {
		reorderStmt.run(index, row.id);
	});
}
