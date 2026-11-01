import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { inspectProjectDirectory } from './project.js';

export const PROJECT_BACKUP_FORMAT = 'mcs-project-backup';
export const PROJECT_BACKUP_VERSION = 1;
const BACKUP_FILENAME = 'backup.json';

/** @param {string} filePath */
async function sha256File(filePath) {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(filePath)) hash.update(chunk);
	return hash.digest('hex');
}

/** @param {string} projectPath */
function listProjectFiles(projectPath) {
	const result = ['project.json', 'mcs.db'];
	const metadataPath = join(projectPath, '.mcs');
	if (!existsSync(metadataPath)) throw new Error('Project .mcs metadata directory is missing');
	for (const required of [
		join(projectPath, 'project.json'),
		join(projectPath, 'mcs.db'),
		metadataPath
	]) {
		const stat = lstatSync(required);
		if (stat.isSymbolicLink())
			throw new Error(`Backup does not follow symbolic links: ${required}`);
	}
	if (!lstatSync(metadataPath).isDirectory())
		throw new Error('Project .mcs path must be a directory');
	/** @param {string} directory */
	function visit(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (directory === metadataPath && entry.name === 'runtime') continue;
			const path = join(directory, entry.name);
			const stat = lstatSync(path);
			if (stat.isSymbolicLink()) throw new Error(`Backup does not follow symbolic links: ${path}`);
			if (stat.isDirectory()) visit(path);
			else if (stat.isFile()) result.push(relative(projectPath, path).split(sep).join('/'));
			else throw new Error(`Unsupported project file type: ${path}`);
		}
	}
	visit(metadataPath);
	return [...new Set(result)].sort();
}

/** @param {string} sourcePath */
function validProject(sourcePath) {
	const inspection = inspectProjectDirectory(sourcePath, { fullIntegrity: true });
	if (!inspection.manifestValid)
		throw new Error(inspection.manifestError ?? 'Invalid project manifest');
	if (!inspection.metadataMatchesDatabase)
		throw new Error('Project metadata and database schema do not match');
	if (inspection.databaseIntegrity !== 'ok')
		throw new Error(inspection.databaseError ?? 'Project database integrity check failed');
	if (!inspection.databaseSchemaChecksPassed || !inspection.projectRootPresent)
		throw new Error('Project database is missing required schema data');
	return inspection;
}

/** @param {string} root @param {string} name */
function safeEntryPath(root, name) {
	if (
		typeof name !== 'string' ||
		name.length === 0 ||
		name.includes('\\') ||
		name.startsWith('/')
	) {
		throw new Error('Backup contains an invalid file path');
	}
	const target = resolve(root, name);
	const base = resolve(root);
	if (target !== base && !target.startsWith(`${base}${sep}`))
		throw new Error('Backup file path escapes its directory');
	return target;
}

/** Make a consistent, versioned project backup without copying transient WAL/runtime state. */
/** @param {string} sourceDirectory @param {string} destinationDirectory */
export async function backupProjectDirectory(sourceDirectory, destinationDirectory) {
	const sourcePath = resolve(sourceDirectory);
	const destinationPath = resolve(destinationDirectory);
	if (destinationPath === sourcePath || destinationPath.startsWith(`${sourcePath}${sep}`)) {
		throw new Error('Backup destination must be outside the project directory');
	}
	if (existsSync(destinationPath))
		throw new Error(`Backup destination already exists: ${destinationPath}`);
	const inspection = validProject(sourcePath);
	const parent = dirname(destinationPath);
	mkdirSync(parent, { recursive: true });
	const stagingPath = join(parent, `.${PROJECT_BACKUP_FORMAT}-${randomUUID()}.tmp`);
	mkdirSync(stagingPath, { recursive: false, mode: 0o700 });
	try {
		const db = new Database(join(sourcePath, 'mcs.db'), { readonly: true, fileMustExist: true });
		try {
			await db.backup(join(stagingPath, 'mcs.db'));
		} finally {
			db.close();
		}
		for (const name of listProjectFiles(sourcePath).filter((name) => name !== 'mcs.db')) {
			const sourceFile = safeEntryPath(sourcePath, name);
			const destinationFile = safeEntryPath(stagingPath, name);
			mkdirSync(dirname(destinationFile), { recursive: true });
			cpSync(sourceFile, destinationFile, { errorOnExist: true, force: false });
		}
		const files = listProjectFiles(stagingPath);
		const entries = [];
		for (const name of files) {
			const file = safeEntryPath(stagingPath, name);
			const stat = lstatSync(file);
			if (!stat.isFile() || stat.isSymbolicLink())
				throw new Error(`Backup contains an unsupported file: ${name}`);
			entries.push({ path: name, size: stat.size, sha256: await sha256File(file) });
		}
		const projectManifest = JSON.parse(readFileSync(join(sourcePath, 'project.json'), 'utf8'));
		writeFileSync(
			join(stagingPath, BACKUP_FILENAME),
			`${JSON.stringify(
				{
					format: PROJECT_BACKUP_FORMAT,
					version: PROJECT_BACKUP_VERSION,
					createdAt: new Date().toISOString(),
					project: { id: projectManifest.id, name: projectManifest.name },
					source: {
						projectFormatVersion: inspection.projectFormatVersion,
						databaseSchemaVersion: inspection.databaseSchemaVersion
					},
					entries
				},
				null,
				2
			)}\n`,
			{ flag: 'wx', mode: 0o600 }
		);
		renameSync(stagingPath, destinationPath);
		return { path: destinationPath, projectId: projectManifest.id, files: entries.length };
	} catch (error) {
		rmSync(stagingPath, { recursive: true, force: true });
		throw error;
	}
}

/** Restore only into a new or empty directory after verifying every file hash and SQLite integrity. */
/** @param {string} backupDirectory @param {string} destinationDirectory */
export async function restoreProjectBackup(backupDirectory, destinationDirectory) {
	const backupPath = resolve(backupDirectory);
	const destinationPath = resolve(destinationDirectory);
	const manifestPath = join(backupPath, BACKUP_FILENAME);
	if (lstatSync(backupPath).isSymbolicLink() || !lstatSync(backupPath).isDirectory())
		throw new Error('Backup path must be a directory');
	if (lstatSync(manifestPath).isSymbolicLink() || !lstatSync(manifestPath).isFile())
		throw new Error('Backup manifest is missing or invalid');
	const backupManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (
		backupManifest.format !== PROJECT_BACKUP_FORMAT ||
		backupManifest.version !== PROJECT_BACKUP_VERSION ||
		!Array.isArray(backupManifest.entries)
	) {
		throw new Error('Unsupported or invalid MCS project backup');
	}
	const names = new Set();
	for (const entry of backupManifest.entries) {
		if (
			!entry ||
			typeof entry.path !== 'string' ||
			names.has(entry.path) ||
			!/^[a-f0-9]{64}$/.test(entry.sha256) ||
			!Number.isSafeInteger(entry.size) ||
			entry.size < 0
		) {
			throw new Error('Backup manifest contains an invalid file entry');
		}
		names.add(entry.path);
		const file = safeEntryPath(backupPath, entry.path);
		const stat = lstatSync(file);
		if (
			!stat.isFile() ||
			stat.isSymbolicLink() ||
			stat.size !== entry.size ||
			(await sha256File(file)) !== entry.sha256
		) {
			throw new Error(`Backup file failed integrity verification: ${entry.path}`);
		}
	}
	if (!names.has('project.json') || !names.has('mcs.db') || !names.has('.mcs/meta.json')) {
		throw new Error('Backup is missing required project files');
	}
	if (existsSync(destinationPath)) {
		const stat = lstatSync(destinationPath);
		if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(destinationPath).length > 0) {
			throw new Error('Restore destination must be a new or empty directory');
		}
	} else {
		mkdirSync(dirname(destinationPath), { recursive: true });
	}
	const stagingPath = `${destinationPath}.restore-${randomUUID()}`;
	mkdirSync(stagingPath, { recursive: false, mode: 0o700 });
	try {
		for (const entry of backupManifest.entries) {
			const sourceFile = safeEntryPath(backupPath, entry.path);
			const destinationFile = safeEntryPath(stagingPath, entry.path);
			mkdirSync(dirname(destinationFile), { recursive: true });
			cpSync(sourceFile, destinationFile, { errorOnExist: true, force: false });
		}
		const inspection = validProject(stagingPath);
		if (inspection.manifest?.id !== backupManifest.project?.id)
			throw new Error('Restored project identity does not match the backup manifest');
		if (existsSync(destinationPath)) rmSync(destinationPath, { recursive: true, force: true });
		renameSync(stagingPath, destinationPath);
		return { path: destinationPath, projectId: backupManifest.project.id };
	} catch (error) {
		rmSync(stagingPath, { recursive: true, force: true });
		throw error;
	}
}
