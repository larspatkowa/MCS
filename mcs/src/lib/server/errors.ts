import { json } from '@sveltejs/kit';
import { logger } from '$lib/server/logger.js';

/** Base API error with HTTP status. Throw in API handlers and use handleApiError in catch. */
export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number = 500
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export class NotFoundError extends ApiError {
	constructor(message: string = 'Not found') {
		super(message, 404);
		this.name = 'NotFoundError';
	}
}

export class BadRequestError extends ApiError {
	constructor(message: string = 'Bad request') {
		super(message, 400);
		this.name = 'BadRequestError';
	}
}

export class ConflictError extends ApiError {
	constructor(message: string = 'Conflict') {
		super(message, 409);
		this.name = 'ConflictError';
	}
}

/** Standard JSON body for API errors: { error: string } */
export function errorBody(message: string): { error: string } {
	return { error: message };
}

/** Return a JSON Response with standard error shape. */
export function apiErrorResponse(message: string, status: number = 500) {
	return json(errorBody(message), { status });
}

/**
 * Use in API route catch blocks. If the error is an ApiError, returns the appropriate response;
 * otherwise returns 500 with a generic message (and logs the error).
 */
export function handleApiError(e: unknown, context?: string): ReturnType<typeof json> {
	if (e instanceof ApiError) {
		// 4xx errors are expected — log at debug level only
		logger.debug(context ?? 'api', e.message, { status: e.status });
		return json(errorBody(e.message), { status: e.status });
	}
	const message = e instanceof Error ? e.message : 'Internal server error';
	logger.exception(context ?? 'api', 'Unhandled error in API handler', e);
	return json(errorBody(message), { status: 500 });
}
