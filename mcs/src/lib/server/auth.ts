import Database from 'better-sqlite3';
import { randomBytes, randomUUID, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir } from './config.js';
import { ApiError } from './errors.js';

export type GlobalRole = 'admin' | 'user';
export type ProjectRole = 'viewer' | 'editor' | 'admin';

export interface AuthUser {
	id: string;
	email: string;
	displayName: string;
	globalRole: GlobalRole;
}

export interface ProjectAccess {
	projectId: string;
	role: ProjectRole;
}

const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const SCRYPT_BYTES = 64;
const databases = new Map<string, Database.Database>();

function databasePath(): string {
	const configDirectory = getConfigDir();
	const path = join(configDirectory, 'auth.db');
	mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
	chmodSync(configDirectory, 0o700);
	return path;
}

function getAuthDb(): Database.Database {
	const path = databasePath();
	let db = databases.get(path);
	if (!db) {
		db = new Database(path);
		chmodSync(path, 0o600);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.pragma('busy_timeout = 5000');
		db.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL COLLATE NOCASE UNIQUE,
				display_name TEXT NOT NULL,
				global_role TEXT NOT NULL CHECK (global_role IN ('admin','user')),
				password_salt BLOB NOT NULL,
				password_hash BLOB NOT NULL,
				created_at TEXT NOT NULL,
				disabled_at TEXT
			);
			CREATE TABLE IF NOT EXISTS sessions (
				token_hash TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				expires_at INTEGER NOT NULL,
				created_at TEXT NOT NULL,
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
			CREATE TABLE IF NOT EXISTS project_memberships (
				project_id TEXT NOT NULL,
				user_id TEXT NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('viewer','editor','admin')),
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (project_id, user_id),
				FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships(user_id, project_id);
			CREATE TABLE IF NOT EXISTS project_api_tokens (
				token_hash TEXT PRIMARY KEY,
				project_id TEXT NOT NULL,
				label TEXT NOT NULL,
				created_by TEXT NOT NULL,
				created_at TEXT NOT NULL,
				revoked_at TEXT,
				FOREIGN KEY (created_by) REFERENCES users(id)
			);
			CREATE INDEX IF NOT EXISTS idx_project_api_tokens_project ON project_api_tokens(project_id, revoked_at);
			CREATE TABLE IF NOT EXISTS audit_events (
				id TEXT PRIMARY KEY,
				actor_user_id TEXT,
				action TEXT NOT NULL,
				project_id TEXT,
				details_json TEXT NOT NULL DEFAULT '{}',
				created_at TEXT NOT NULL,
				FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
			);
			CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
		`);
		databases.set(path, db);
	}
	return db;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function validatePassword(password: string): void {
	if (password.length < 12 || password.length > 1024) {
		throw new ApiError('Password must contain between 12 and 1,024 characters', 400);
	}
}

function hashSecret(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function equalSecret(left: string, right: string): boolean {
	const leftDigest = createHash('sha256').update(left).digest();
	const rightDigest = createHash('sha256').update(right).digest();
	return timingSafeEqual(leftDigest, rightDigest);
}

function userFromRow(row: Record<string, unknown>): AuthUser {
	return {
		id: String(row.id),
		email: String(row.email),
		displayName: String(row.display_name),
		globalRole: row.global_role === 'admin' ? 'admin' : 'user'
	};
}

export function authenticationRequired(): boolean {
	return process.env.MCS_AUTH_REQUIRED === '1';
}

export function secureAuthCookie(requestUrl?: string): boolean {
	if (process.env.MCS_AUTH_COOKIE_SECURE === '1') return true;
	if (process.env.MCS_AUTH_COOKIE_SECURE === '0') return false;
	return process.env.NODE_ENV === 'production' || requestUrl?.startsWith('https://') === true;
}

export function hasUsers(): boolean {
	const row = getAuthDb().prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
	return row.count > 0;
}

export function bootstrapAdmin(
	bootstrapToken: string,
	providedToken: string,
	email: string,
	displayName: string,
	password: string
): AuthUser {
	if (!bootstrapToken || !equalSecret(bootstrapToken, providedToken)) {
		throw new ApiError('Invalid bootstrap token', 401);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
		throw new ApiError('Enter a valid email address', 400);
	validatePassword(password);
	const db = getAuthDb();
	const salt = randomBytes(16);
	const passwordHash = scryptSync(password, salt, SCRYPT_BYTES);
	const user: AuthUser = {
		id: randomUUID(),
		email: normalizeEmail(email),
		displayName: displayName.trim().slice(0, 120) || email.trim(),
		globalRole: 'admin'
	};
	const create = db.transaction(() => {
		const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
		if (row.count !== 0) {
			throw new ApiError('An administrator has already been created', 409);
		}
		db.prepare(
			`INSERT INTO users (id,email,display_name,global_role,password_salt,password_hash,created_at)
			VALUES (?,?,?,?,?,?,?)`
		).run(
			user.id,
			user.email,
			user.displayName,
			'admin',
			salt,
			passwordHash,
			new Date().toISOString()
		);
	});
	create();
	recordAudit(user.id, 'auth.bootstrap');
	return user;
}

export function createUser(
	email: string,
	displayName: string,
	password: string,
	actorUserId?: string
): AuthUser {
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
		throw new ApiError('Enter a valid email address', 400);
	validatePassword(password);
	const normalizedEmail = normalizeEmail(email);
	const db = getAuthDb();
	if (db.prepare('SELECT 1 FROM users WHERE email=?').get(normalizedEmail)) {
		throw new ApiError('An account with this email already exists', 409);
	}
	const user: AuthUser = {
		id: randomUUID(),
		email: normalizedEmail,
		displayName: displayName.trim().slice(0, 120) || email.trim(),
		globalRole: 'user'
	};
	const salt = randomBytes(16);
	const passwordHash = scryptSync(password, salt, SCRYPT_BYTES);
	try {
		db.prepare(
			`INSERT INTO users (id,email,display_name,global_role,password_salt,password_hash,created_at)
			VALUES (?,?,?,?,?,?,?)`
		).run(
			user.id,
			user.email,
			user.displayName,
			user.globalRole,
			salt,
			passwordHash,
			new Date().toISOString()
		);
	} catch (error) {
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			throw new ApiError('An account with this email already exists', 409);
		}
		throw error;
	}
	recordAudit(actorUserId ?? null, 'user.create', undefined, {
		userId: user.id,
		email: user.email
	});
	return user;
}

export function listUsers(): AuthUser[] {
	return (
		getAuthDb()
			.prepare(
				'SELECT id,email,display_name,global_role FROM users WHERE disabled_at IS NULL ORDER BY email'
			)
			.all() as Record<string, unknown>[]
	).map(userFromRow);
}

export function login(
	email: string,
	password: string
): { user: AuthUser; token: string; expiresAt: number } | null {
	const row = getAuthDb()
		.prepare(
			`SELECT id,email,display_name,global_role,password_salt,password_hash
		FROM users WHERE email = ? AND disabled_at IS NULL`
		)
		.get(normalizeEmail(email)) as Record<string, unknown> | undefined;
	if (!row) {
		// Spend comparable CPU for unknown accounts to reduce account enumeration timing.
		scryptSync(password, Buffer.alloc(16), SCRYPT_BYTES);
		return null;
	}
	const candidate = scryptSync(password, row.password_salt as Buffer, SCRYPT_BYTES);
	if (!timingSafeEqual(candidate, row.password_hash as Buffer)) return null;
	const token = randomBytes(32).toString('base64url');
	const expiresAt = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
	getAuthDb()
		.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)')
		.run(hashSecret(token), row.id, expiresAt, new Date().toISOString());
	const user = userFromRow(row);
	recordAudit(user.id, 'auth.login');
	return { user, token, expiresAt };
}

export function resolveSession(token: string | undefined): AuthUser | null {
	if (!token) return null;
	const row = getAuthDb()
		.prepare(
			`SELECT u.id,u.email,u.display_name,u.global_role
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL`
		)
		.get(hashSecret(token), Math.floor(Date.now() / 1000)) as Record<string, unknown> | undefined;
	return row ? userFromRow(row) : null;
}

export function revokeSession(token: string | undefined): void {
	if (!token) return;
	getAuthDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSecret(token));
}

export function getProjectRole(userId: string, projectId: string): ProjectRole | null {
	const db = getAuthDb();
	const user = db
		.prepare('SELECT global_role FROM users WHERE id = ? AND disabled_at IS NULL')
		.get(userId) as { global_role: string } | undefined;
	if (user?.global_role === 'admin') return 'admin';
	const row = db
		.prepare('SELECT role FROM project_memberships WHERE user_id = ? AND project_id = ?')
		.get(userId, projectId) as { role: ProjectRole } | undefined;
	return row?.role ?? null;
}

export function listAccessibleProjectIds(user: AuthUser): string[] | null {
	if (user.globalRole === 'admin') return null;
	return (
		getAuthDb()
			.prepare('SELECT project_id FROM project_memberships WHERE user_id = ? ORDER BY project_id')
			.all(user.id) as { project_id: string }[]
	).map((row) => row.project_id);
}

export function setProjectMembership(
	projectId: string,
	userId: string,
	role: ProjectRole,
	actorUserId?: string
): void {
	if (!['viewer', 'editor', 'admin'].includes(role))
		throw new ApiError('Invalid project role', 400);
	const now = new Date().toISOString();
	getAuthDb()
		.prepare(
			`INSERT INTO project_memberships (project_id,user_id,role,created_at,updated_at)
		VALUES (?,?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role, updated_at=excluded.updated_at`
		)
		.run(projectId, userId, role, now, now);
	recordAudit(actorUserId ?? null, 'project.membership.update', projectId, { userId, role });
}

export function removeProjectMembership(
	projectId: string,
	userId: string,
	actorUserId?: string
): boolean {
	const changed =
		getAuthDb()
			.prepare('DELETE FROM project_memberships WHERE project_id = ? AND user_id = ?')
			.run(projectId, userId).changes > 0;
	if (changed) recordAudit(actorUserId ?? null, 'project.membership.remove', projectId, { userId });
	return changed;
}

export function listProjectMemberships(projectId: string): Record<string, unknown>[] {
	return getAuthDb()
		.prepare(
			`SELECT m.project_id AS projectId,m.user_id AS userId,u.email,u.display_name AS displayName,m.role,m.created_at AS createdAt
		FROM project_memberships m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY u.email`
		)
		.all(projectId) as Record<string, unknown>[];
}

export function createProjectApiToken(projectId: string, label: string, createdBy: string): string {
	const token = `mcs_${randomBytes(32).toString('base64url')}`;
	getAuthDb()
		.prepare(
			`INSERT INTO project_api_tokens (token_hash,project_id,label,created_by,created_at)
		VALUES (?,?,?,?,?)`
		)
		.run(
			hashSecret(token),
			projectId,
			label.trim().slice(0, 120) || 'Acquisition bridge',
			createdBy,
			new Date().toISOString()
		);
	recordAudit(createdBy, 'project.token.create', projectId, { label });
	return token;
}

export function projectForApiToken(token: string | undefined): string | null {
	if (!token) return null;
	const row = getAuthDb()
		.prepare(
			'SELECT project_id FROM project_api_tokens WHERE token_hash = ? AND revoked_at IS NULL'
		)
		.get(hashSecret(token)) as { project_id: string } | undefined;
	return row?.project_id ?? null;
}

export function listProjectApiTokens(projectId: string): Record<string, unknown>[] {
	return getAuthDb()
		.prepare(
			`SELECT substr(token_hash,1,10) AS tokenPrefix,label,created_by AS createdBy,created_at AS createdAt,revoked_at AS revokedAt
		FROM project_api_tokens WHERE project_id=? ORDER BY created_at DESC`
		)
		.all(projectId) as Record<string, unknown>[];
}

export function revokeProjectApiToken(
	projectId: string,
	prefix: string,
	actorUserId: string
): boolean {
	const changed =
		getAuthDb()
			.prepare(
				`UPDATE project_api_tokens SET revoked_at=?
		WHERE project_id=? AND substr(token_hash,1,10)=? AND revoked_at IS NULL`
			)
			.run(new Date().toISOString(), projectId, prefix).changes > 0;
	if (changed) recordAudit(actorUserId, 'project.token.revoke', projectId, { tokenPrefix: prefix });
	return changed;
}

export function recordAudit(
	actorUserId: string | null,
	action: string,
	projectId?: string,
	details: Record<string, unknown> = {}
): void {
	getAuthDb()
		.prepare(
			`INSERT INTO audit_events (id,actor_user_id,action,project_id,details_json,created_at)
		VALUES (?,?,?,?,?,?)`
		)
		.run(
			randomUUID(),
			actorUserId,
			action,
			projectId ?? null,
			JSON.stringify(details),
			new Date().toISOString()
		);
}

export function listAuditEvents(limit = 500): Record<string, unknown>[] {
	const boundedLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
	return getAuthDb()
		.prepare(
			`SELECT id,actor_user_id AS actorUserId,action,project_id AS projectId,details_json AS detailsJson,created_at AS createdAt
		FROM audit_events ORDER BY created_at DESC LIMIT ?`
		)
		.all(boundedLimit) as Record<string, unknown>[];
}

export function closeAuthDatabases(): void {
	for (const db of databases.values()) db.close();
	databases.clear();
}
