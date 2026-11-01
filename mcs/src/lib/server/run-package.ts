import { createHash } from 'node:crypto';
import { BadRequestError } from './errors.js';
import * as mediaDb from './media-db.js';
import * as runsDb from './runs-db.js';
import * as streamsDb from './streams-db.js';

export const RUN_PACKAGE_VERSION = 1;
export const MAX_RUN_PACKAGE_EVENTS = 1_000_000;

/**
 * Stream one deterministic run package. Samples remain raw records; the
 * footer makes the sample portion independently checkable without buffering
 * the whole export in memory.
 */
export function* exportRunPackage(projectPath: string, runId: string): Generator<string> {
	const run = runsDb.getRun(projectPath, runId);
	if (run.sampleCount > MAX_RUN_PACKAGE_EVENTS) {
		throw new BadRequestError(`Run exceeds the ${MAX_RUN_PACKAGE_EVENTS} sample export limit`);
	}

	const streamIds = new Set(runsDb.listRunStreamIds(projectPath, runId));
	const streams = streamsDb.listStreams(projectPath).filter((stream) => streamIds.has(stream.id));
	for (const streamId of streamIds) {
		if (!streams.some((stream) => stream.id === streamId)) {
			streams.push({ id: streamId, name: streamId });
		}
	}
	streams.sort((left, right) => left.id.localeCompare(right.id));

	const media = mediaDb.listMediaBindings(projectPath, runId).flatMap((binding) => {
		const asset = mediaDb.getMediaAsset(projectPath, binding.assetId);
		return asset ? [{ binding, track: mediaDb.mediaTrackForBinding(asset, binding) }] : [];
	});
	const header = {
		type: 'mcs-run-package',
		version: RUN_PACKAGE_VERSION,
		run,
		streams,
		media,
		integrity: { algorithm: 'sha256', scope: 'sample-records', footer: true }
	};
	yield `${JSON.stringify(header)}\n`;

	const hash = createHash('sha256');
	let exported = 0;
	let cursor: string | undefined;
	do {
		const page = runsDb.getRunEventPage(projectPath, runId, {
			limit: 250_000,
			cursor
		});
		for (const event of page.events) {
			exported += 1;
			if (exported > MAX_RUN_PACKAGE_EVENTS) {
				throw new BadRequestError(`Run exceeds the ${MAX_RUN_PACKAGE_EVENTS} sample export limit`);
			}
			const line = `${JSON.stringify({ type: 'sample', ...event })}\n`;
			hash.update(line);
			yield line;
		}
		if (!page.hasMore || !page.nextCursor) break;
		cursor = page.nextCursor;
	} while (true);

	for (const metric of runsDb.listHealthMetrics(projectPath, runId)) {
		yield `${JSON.stringify({ type: 'health', ...metric })}\n`;
	}
	yield `${JSON.stringify({
		type: 'integrity',
		algorithm: 'sha256',
		scope: 'sample-records',
		records: exported,
		sha256: hash.digest('hex')
	})}\n`;
}
