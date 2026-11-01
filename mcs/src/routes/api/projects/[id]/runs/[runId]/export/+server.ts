import type { RequestHandler } from './$types';
import { apiErrorResponse, handleApiError } from '$lib/server/errors.js';
import { getProjectPathById } from '$lib/server/project.js';
import { exportRunPackage } from '$lib/server/run-package.js';

function safeFilename(runId: string): string {
	return `run-${runId.replace(/[^A-Za-z0-9_.-]/g, '') || 'export'}.ndjson`;
}

export const GET: RequestHandler = ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const records = exportRunPackage(projectPath, params.runId);
		const encoder = new TextEncoder();
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				const next = records.next();
				if (next.done) controller.close();
				else controller.enqueue(encoder.encode(next.value));
			}
		});
		return new Response(body, {
			headers: {
				'Content-Type': 'application/x-ndjson; charset=utf-8',
				'Content-Disposition': `attachment; filename="${safeFilename(params.runId)}"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		return handleApiError(error, 'GET /api/projects/[id]/runs/[runId]/export');
	}
};
