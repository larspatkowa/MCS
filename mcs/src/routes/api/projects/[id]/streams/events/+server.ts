import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project';
import { subscribeStreamEvents, subscribeLimitEvents } from '$lib/server/stream-events';
import { apiErrorResponse } from '$lib/server/errors';
import * as streamsDb from '$lib/server/streams-db.js';

export const GET: RequestHandler = async ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	const rawCursor = request.headers.get('last-event-id');
	const requestedCursor = rawCursor === null ? null : Number(rawCursor);
	if (requestedCursor !== null && (!Number.isSafeInteger(requestedCursor) || requestedCursor < 0))
		return apiErrorResponse('Invalid event cursor', 400);

	let cleanup: (() => void) | null = null;
	const stream = new ReadableStream(
		{
			start(controller) {
				const encoder = new TextEncoder();
				let lastSentId = requestedCursor ?? 0;
				let ready = false;
				let closed = false;
				const earlyEvents: {
					streamId: string;
					timestamp: number;
					values: Record<string, unknown>;
					eventId?: number;
					samples?: { timestamp: number; values: Record<string, unknown>; eventId?: number }[];
				}[] = [];
				let keepAlive: ReturnType<typeof setInterval> | null = null;
				let unsubscribeStream = () => {};
				let unsubscribeLimit = () => {};

				function close() {
					if (closed) return;
					closed = true;
					if (keepAlive) clearInterval(keepAlive);
					unsubscribeStream();
					unsubscribeLimit();
					try {
						controller.close();
					} catch {}
				}

				function send(obj: unknown, eventId?: number): boolean {
					if (closed) return false;
					if (controller.desiredSize !== null && controller.desiredSize <= 0) {
						close();
						return false;
					}
					try {
						const id = eventId === undefined ? '' : `id: ${eventId}\n`;
						controller.enqueue(encoder.encode(`${id}data: ${JSON.stringify(obj)}\n\n`));
						if (eventId !== undefined) lastSentId = Math.max(lastSentId, eventId);
						return true;
					} catch {
						close();
						return false;
					}
				}

				unsubscribeStream = subscribeStreamEvents(params.id, (event) => {
					// Keep original format for backwards compat with existing components
					if (!ready) {
						if (earlyEvents.length >= 512) {
							close();
							return;
						}
						earlyEvents.push(event);
						return;
					}
					if (event.eventId !== undefined && event.eventId <= lastSentId) return;
					send(event, event.eventId);
				});

				unsubscribeLimit = subscribeLimitEvents(params.id, (msg) => {
					send(msg);
				});
				cleanup = close;
				let catchup: ReturnType<typeof streamsDb.getHistoryEventsAfter> = [];
				if (requestedCursor === null) {
					// New displays seed their own visible history window. Start the live
					// stream at the current durable watermark instead of replaying the
					// project's complete telemetry archive to every new browser session.
					const watermark = streamsDb.getLatestEventId(projectPath);
					lastSentId = watermark;
					send({ type: 'checkpoint', eventId: watermark }, watermark);
				} else {
					catchup = streamsDb.getHistoryEventsAfter(projectPath, requestedCursor, 10_000);
					for (const event of catchup) {
						if (!send(event, event.eventId)) break;
					}
				}
				ready = true;
				for (const event of earlyEvents) {
					if (closed) break;
					if (
						requestedCursor !== null &&
						event.eventId !== undefined &&
						event.eventId <= lastSentId
					)
						continue;
					send(event, event.eventId);
				}
				earlyEvents.length = 0;
				if (catchup.length === 10_000) close();

				keepAlive = setInterval(() => {
					if (closed) return;
					if (controller.desiredSize !== null && controller.desiredSize <= 0) {
						close();
						return;
					}
					try {
						controller.enqueue(encoder.encode(': keep-alive\n\n'));
					} catch {
						close();
					}
				}, 15000);
			},
			cancel() {
				if (cleanup) cleanup();
			}
		},
		{ highWaterMark: 128 }
	);

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-store',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
