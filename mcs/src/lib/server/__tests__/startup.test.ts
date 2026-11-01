import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clearConfigCache, setDefaultProject } from '../config.js';
import { createProject } from '../project.js';
import { resolveStartup } from '../startup.js';

const testRoot = mkdtempSync(join(tmpdir(), 'mcs-startup-test-'));
const configDirectory = join(testRoot, 'config');
const projectsDirectory = join(testRoot, 'projects');

beforeEach(() => {
	process.env.MCS_CONFIG_DIR = configDirectory;
	process.env.MCS_PROJECTS_DIR = projectsDirectory;
	clearConfigCache();
});

afterAll(() => {
	delete process.env.MCS_CONFIG_DIR;
	delete process.env.MCS_PROJECTS_DIR;
	rmSync(testRoot, { recursive: true, force: true });
});

describe('local MCS startup resolution', () => {
	it('returns the command-line screen when no default project is configured', () => {
		expect(resolveStartup()).toEqual({ kind: 'no-project' });
	});

	it('resolves a valid configured default project to its direct workspace id', () => {
		const projectPath = join(projectsDirectory, 'direct-start');
		const manifest = createProject(projectPath, 'Direct Start');
		setDefaultProject(projectPath);

		expect(resolveStartup()).toEqual({
			kind: 'project',
			projectId: manifest.id,
			projectPath
		});
	});

	it('does not redirect to a malformed configured project', () => {
		setDefaultProject(join(projectsDirectory, 'missing'));
		const resolution = resolveStartup();
		expect(resolution.kind).toBe('no-project');
		if (resolution.kind === 'no-project')
			expect(resolution.issue).toContain('project.json not found');
	});
});
