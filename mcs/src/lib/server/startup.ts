import { loadConfig } from './config.js';
import { inspectProjectDirectory } from '../../../project-format/project.js';

export type StartupResolution =
	| { kind: 'no-project'; issue?: string }
	| { kind: 'project'; projectId: string; projectPath: string };

export function resolveStartup(): StartupResolution {
	const defaultProjectPath = loadConfig().defaultProjectPath;
	if (!defaultProjectPath) return { kind: 'no-project' };

	const inspection = inspectProjectDirectory(defaultProjectPath);
	if (inspection.ready && inspection.manifest?.id) {
		return {
			kind: 'project',
			projectId: inspection.manifest.id,
			projectPath: inspection.path
		};
	}

	return {
		kind: 'no-project',
		issue: inspection.forwardIncompatible
			? 'The configured project was created by a newer MCS version.'
			: (inspection.manifestError ??
				inspection.metadataError ??
				inspection.databaseError ??
				'The configured project is not ready.')
	};
}
