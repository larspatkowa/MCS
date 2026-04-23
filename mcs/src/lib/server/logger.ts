/**
 * MCS structured server logger.
 *
 * Outputs JSON-formatted log records to stdout/stderr so they can be parsed
 * by log aggregators (Loki, Datadog, CloudWatch, etc.) while remaining
 * readable in a terminal.
 *
 * Usage:
 *   import { logger } from '$lib/server/logger';
 *   logger.info('ingest', 'sample received', { streamId, projectId });
 *   logger.error('db', 'query failed', { error: e.message });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
	ts: string; // ISO-8601
	level: LogLevel;
	context: string; // e.g. 'ingest', 'plugin', 'api'
	msg: string;
	[key: string]: unknown; // arbitrary structured fields
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function getMinLevel(): LogLevel {
	const env = (process.env.MCS_LOG_LEVEL ?? 'info').toLowerCase() as LogLevel;
	return LEVEL_RANK[env] !== undefined ? env : 'info';
}

function shouldLog(level: LogLevel): boolean {
	return LEVEL_RANK[level] >= LEVEL_RANK[getMinLevel()];
}

function emit(level: LogLevel, context: string, msg: string, fields?: Record<string, unknown>) {
	if (!shouldLog(level)) return;
	const record: LogRecord = {
		ts: new Date().toISOString(),
		level,
		context,
		msg,
		...fields
	};

	const line = JSON.stringify(record);
	if (level === 'error' || level === 'warn') {
		process.stderr.write(line + '\n');
	} else {
		process.stdout.write(line + '\n');
	}
}

export const logger = {
	debug(context: string, msg: string, fields?: Record<string, unknown>) {
		emit('debug', context, msg, fields);
	},
	info(context: string, msg: string, fields?: Record<string, unknown>) {
		emit('info', context, msg, fields);
	},
	warn(context: string, msg: string, fields?: Record<string, unknown>) {
		emit('warn', context, msg, fields);
	},
	error(context: string, msg: string, fields?: Record<string, unknown>) {
		emit('error', context, msg, fields);
	},
	/** Convenience: log an Error object with stack trace. */
	exception(context: string, msg: string, err: unknown, fields?: Record<string, unknown>) {
		const errFields: Record<string, unknown> = {
			...fields,
			errorMessage: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined
		};
		emit('error', context, msg, errFields);
	}
};
