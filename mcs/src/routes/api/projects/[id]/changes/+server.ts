import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import * as projectChanges from '$lib/server/project-changes';
import { apiErrorResponse } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;

			const send = (event: { type: string; objectId?: string }) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					closed = true;
				}
			};

			const unsubscribe = projectChanges.subscribe(params.id, (event) => {
				send(event);
			});

			// Heartbeat every 30s so proxies don't close the connection
			const heartbeat = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					closed = true;
				}
			}, 30000);

			// When client disconnects, clean up
			request.signal.addEventListener('abort', () => {
				closed = true;
				clearInterval(heartbeat);
				unsubscribe();
				try {
					controller.close();
				} catch {
					// Controller may already be closed
				}
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
