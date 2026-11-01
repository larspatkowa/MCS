import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache } from '../config.js';
import {
	bootstrapAdmin,
	closeAuthDatabases,
	createProjectApiToken,
	createUser,
	getProjectRole,
	hasUsers,
	listAuditEvents,
	listProjectApiTokens,
	login,
	projectForApiToken,
	removeProjectMembership,
	resolveSession,
	revokeProjectApiToken,
	revokeSession,
	setProjectMembership
} from '../auth.js';

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'mcs-auth-test-'));
	process.env.MCS_CONFIG_DIR = join(root, 'config');
	clearConfigCache();
});

afterEach(() => {
	closeAuthDatabases();
	clearConfigCache();
	delete process.env.MCS_CONFIG_DIR;
	rmSync(root, { recursive: true, force: true });
});

describe('MCS authentication storage', () => {
	it('bootstraps one admin and issues revocable hashed sessions', () => {
		const admin = bootstrapAdmin(
			'bootstrap-secret',
			'bootstrap-secret',
			'OPS@example.com',
			'Ops',
			'a-long-password-123'
		);
		expect(admin).toMatchObject({ email: 'ops@example.com', globalRole: 'admin' });
		expect(hasUsers()).toBe(true);
		expect(() =>
			bootstrapAdmin(
				'bootstrap-secret',
				'bootstrap-secret',
				'other@example.com',
				'Other',
				'a-long-password-456'
			)
		).toThrow(/already been created/);

		const session = login('OPS@example.com', 'a-long-password-123');
		expect(login('ops@example.com', 'wrong-password')).toBeNull();
		expect(session).not.toBeNull();
		if (!session) throw new Error('Expected a session');
		expect(resolveSession(session.token)).toEqual(admin);
		revokeSession(session.token);
		expect(resolveSession(session.token)).toBeNull();
	});

	it('enforces project membership roles and revokes project-scoped ingest tokens', () => {
		const admin = bootstrapAdmin(
			'bootstrap-secret',
			'bootstrap-secret',
			'admin@example.com',
			'Admin',
			'a-long-password-123'
		);
		const viewer = createUser('viewer@example.com', 'Viewer', 'a-long-password-456', admin.id);
		setProjectMembership('project-a', viewer.id, 'viewer', admin.id);
		expect(getProjectRole(viewer.id, 'project-a')).toBe('viewer');
		expect(getProjectRole(viewer.id, 'project-b')).toBeNull();
		expect(getProjectRole(admin.id, 'project-b')).toBe('admin');
		expect(removeProjectMembership('project-a', viewer.id, admin.id)).toBe(true);
		expect(getProjectRole(viewer.id, 'project-a')).toBeNull();

		const token = createProjectApiToken('project-a', 'bridge', admin.id);
		expect(projectForApiToken(token)).toBe('project-a');
		const tokenPrefix = String(listProjectApiTokens('project-a')[0].tokenPrefix);
		expect(revokeProjectApiToken('project-a', tokenPrefix, admin.id)).toBe(true);
		expect(projectForApiToken(token)).toBeNull();
		expect(listAuditEvents().map((event) => event.action)).toEqual(
			expect.arrayContaining([
				'auth.bootstrap',
				'user.create',
				'project.membership.update',
				'project.membership.remove',
				'project.token.create',
				'project.token.revoke'
			])
		);
	});
});
