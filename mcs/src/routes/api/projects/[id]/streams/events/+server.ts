import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import { subscribeStreamEvents, subscribeLimitEvents } from '$lib/server/stream-events';
import { apiErrorResponse } from '$lib/server/errors';

export const GET: RequestHandler = async ({ params }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);

	let cleanup: (() => void) | null = null;
	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			function send(obj: unknown) {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
				} catch {
					// connection may be closed
				}
			}

			const unsubscribeStream = subscribeStreamEvents(params.id, (event) => {
				// Keep original format for backwards compat with existing components
				send(event);
			});

			const unsubscribeLimit = subscribeLimitEvents(params.id, (msg) => {
				send(msg);
			});

			const keepAlive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keep-alive\n\n'));
				} catch {
					clearInterval(keepAlive);
				}
			}, 15000);

			cleanup = () => {
				clearInterval(keepAlive);
				unsubscribeStream();
				unsubscribeLimit();
			};
		},
		cancel() {
			if (cleanup) cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-store',
			Connection: 'keep-alive'
		}
	});
};
