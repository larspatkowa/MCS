/**
 * Model Context Protocol server. Agents connect over Streamable HTTP at
 * /api/mcp (or over stdio through `mcs mcp`) and get the same data and access
 * rules as the REST API: a project token reaches only its project, a signed-in
 * viewer can read but not write, and loopback mode without accounts is open.
 */
import { resolve } from 'node:path';
import { getDb } from './db.js';
import { loadConfig } from './config.js';
import { getProjectPathById, readManifest } from './project.js';
import { authenticationRequired, getProjectRole, listAccessibleProjectIds } from './auth.js';
import type { AuthUser } from './auth.js';
import * as streamsDb from './streams-db.js';
import * as limitsDb from './limits-db.js';
import * as runsDb from './runs-db.js';
import * as objectsDb from './objects-db.js';
import { listSources } from './sources-db.js';
import { performIngestBatchDetailed } from './ingest-core.js';
import { validateIdentifier } from './ingest-validation.js';
import { canContainChildren, type ObjectType } from '$lib/objects';
import { getDefaultPropsForType } from '$lib/objects/default-props.js';

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'mcs', title: 'MCS mission control', version: '0.1.0' };

export interface McpAccess {
	user: AuthUser | null;
	/** Set when the caller authenticated with a project API token. */
	tokenProjectId: string | null;
}

class ToolError extends Error {}

/**
 * read: view telemetry and displays. ingest: write samples. edit: change
 * displays, limits, alarms and recording.
 */
type AccessLevel = 'read' | 'ingest' | 'edit';

function can(access: McpAccess, projectId: string, level: AccessLevel): boolean {
	// Project tokens are issued to acquisition bridges. Over REST they can only
	// ingest; here they may also read that project, but never edit it.
	if (access.tokenProjectId) return access.tokenProjectId === projectId && level !== 'edit';
	if (!authenticationRequired()) return true;
	if (!access.user) return false;
	const role = getProjectRole(access.user.id, projectId);
	return role !== null && (level === 'read' || role !== 'viewer');
}

function project(
	access: McpAccess,
	args: Record<string, unknown>,
	level: AccessLevel = 'read'
): string {
	const projectId = validateIdentifier(args.projectId, 'projectId');
	if (!can(access, projectId, level)) {
		throw new ToolError(
			level === 'read'
				? 'Project access denied'
				: access.tokenProjectId && level === 'edit'
					? 'Project tokens can read and ingest only; this tool needs a signed-in editor'
					: 'Editor access to this project is required'
		);
	}
	const path = getProjectPathById(projectId);
	if (!path) throw new ToolError(`Project not found: ${projectId}`);
	return path;
}

/** Unix seconds from a number, an ISO date, "now", or a relative "-15m" / "-2h" / "-30s". */
export function parseTime(input: unknown, fallback: number): number {
	if (input === undefined || input === null || input === '') return fallback;
	if (typeof input === 'number' && Number.isFinite(input)) return input;
	if (typeof input !== 'string') throw new ToolError('Times are Unix seconds, ISO 8601, or "-15m"');
	const text = input.trim();
	if (text === 'now') return Date.now() / 1000;
	const relative = text.match(/^-(\d+(?:\.\d+)?)\s*(s|m|h|d)$/);
	if (relative) {
		const unit = { s: 1, m: 60, h: 3600, d: 86_400 }[relative[2] as 's' | 'm' | 'h' | 'd'];
		return Date.now() / 1000 - Number(relative[1]) * unit;
	}
	if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
	const parsed = Date.parse(text);
	if (Number.isNaN(parsed)) throw new ToolError(`Unrecognized time: ${text}`);
	return parsed / 1000;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function fieldName(input: unknown): string {
	const field = input === undefined ? 'value' : String(input);
	if (!/^[A-Za-z0-9_.-]{1,64}$/.test(field)) throw new ToolError('field must be a simple name');
	return field;
}

const CREATABLE_TYPES = [
	'folder',
	'grid-layout',
	'flex-layout',
	'tabs',
	'stack',
	'line-plot',
	'scatter-plot',
	'ground-track',
	'gauge',
	'mission-clock',
	'telemetry-table',
	'values-table',
	'event-log',
	'markdown-note',
	'web-page'
];

const timeArg = {
	description: 'Unix seconds, ISO 8601, "now", or relative like "-15m", "-2h"',
	type: ['string', 'number']
};
const projectArg = { type: 'string', description: 'Project id from list_projects' };

interface Tool {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: Record<string, boolean>;
	run: (args: Record<string, unknown>, access: McpAccess) => unknown;
}

const readOnly = { readOnlyHint: true, openWorldHint: false };

const TOOLS: Tool[] = [
	{
		name: 'list_projects',
		title: 'List projects',
		description: 'Projects this caller can open, with ids for the other tools.',
		inputSchema: { type: 'object', properties: {} },
		annotations: readOnly,
		run: (_args, access) => {
			// The auth hook already rejects anonymous calls; this keeps the filter fail-closed.
			if (authenticationRequired() && !access.user && !access.tokenProjectId) {
				throw new ToolError('Authentication required');
			}
			const visible =
				authenticationRequired() && access.user ? listAccessibleProjectIds(access.user) : null;
			return loadConfig()
				.recentProjectPaths.map((path) => readManifest(resolve(path)))
				.filter((manifest) => manifest !== null)
				.filter((manifest) =>
					access.tokenProjectId ? manifest.id === access.tokenProjectId : true
				)
				.filter((manifest) => !visible || visible.includes(manifest.id))
				.map((manifest) => ({ id: manifest.id, name: manifest.name, notes: manifest.notes }));
		}
	},
	{
		name: 'describe_project',
		title: 'Describe project',
		description:
			'Streams (with fields, units and newest sample time), telemetry sources and their health, the active recording run, and alarm limits. Call this first to learn stream ids.',
		inputSchema: {
			type: 'object',
			properties: { projectId: projectArg },
			required: ['projectId']
		},
		annotations: readOnly,
		run: (args, access) => {
			const path = project(access, args);
			const limits = limitsDb.getLimitConfigs(path);
			return {
				streams: streamsDb.listStreams(path).map((stream) => {
					const newest = streamsDb.getStreamSamples(path, stream.id, undefined, undefined, 1)[0];
					const fields = newest
						? Object.keys(newest).filter((key) => key !== 'timestamp' && key !== 'value')
						: [];
					return {
						id: stream.id,
						name: stream.name,
						metadata: stream.metadata ?? {},
						fields: fields.length ? fields : newest ? ['value'] : [],
						newestSampleAt: newest ? iso(newest.timestamp) : null,
						limits: limits.filter((limit) => limit.streamId === stream.id)
					};
				}),
				sources: listSources(path),
				activeRun: runsDb.getActiveRun(path)
			};
		}
	},
	{
		name: 'get_latest',
		title: 'Get latest values',
		description: 'Newest sample of each stream, or of the listed streams, with its age.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				streamIds: { type: 'array', items: { type: 'string' } }
			},
			required: ['projectId']
		},
		annotations: readOnly,
		run: (args, access) => {
			const path = project(access, args);
			const ids = Array.isArray(args.streamIds)
				? args.streamIds.map((id) => validateIdentifier(id, 'streamId'))
				: streamsDb.listStreams(path).map((stream) => stream.id);
			const now = Date.now() / 1000;
			return ids.map((streamId) => {
				const sample = streamsDb.getStreamSamples(path, streamId, undefined, undefined, 1)[0];
				if (!sample) return { streamId, sample: null };
				const { timestamp, ...values } = sample;
				return {
					streamId,
					time: iso(timestamp),
					ageSeconds: Math.round((now - timestamp) * 10) / 10,
					values
				};
			});
		}
	},
	{
		name: 'query_history',
		title: 'Query history',
		description:
			'Samples of one stream in a time range. Ranges larger than maxSamples are reduced to the minimum and maximum of each time bucket, so peaks survive.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				streamId: { type: 'string' },
				from: { ...timeArg, description: `Start. ${timeArg.description}. Default "-1h".` },
				to: { ...timeArg, description: `End. ${timeArg.description}. Default "now".` },
				maxSamples: { type: 'integer', minimum: 2, maximum: 5000, default: 500 }
			},
			required: ['projectId', 'streamId']
		},
		annotations: readOnly,
		run: (args, access) => {
			const path = project(access, args);
			const streamId = validateIdentifier(args.streamId, 'streamId');
			const to = parseTime(args.to, Date.now() / 1000);
			const from = parseTime(args.from, to - 3600);
			const limit = Math.max(2, Math.min(5000, Math.floor(Number(args.maxSamples ?? 500))));
			const samples = streamsDb.getStreamSamples(path, streamId, from, to, limit);
			return {
				streamId,
				from: iso(from),
				to: iso(to),
				count: samples.length,
				samples: samples.map(({ timestamp, ...values }) => ({ t: iso(timestamp), ...values }))
			};
		}
	},
	{
		name: 'stream_stats',
		title: 'Stream statistics',
		description:
			'Count, minimum, maximum (with the time it occurred), mean, first and last value of one numeric field over a time range. Use it for questions like apogee or peak chamber pressure.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				streamId: { type: 'string' },
				field: { type: 'string', default: 'value' },
				from: { ...timeArg, description: `Start. Default "-1h".` },
				to: { ...timeArg, description: 'End. Default "now".' }
			},
			required: ['projectId', 'streamId']
		},
		annotations: readOnly,
		run: (args, access) => {
			const path = project(access, args);
			const streamId = validateIdentifier(args.streamId, 'streamId');
			const field = fieldName(args.field);
			const to = parseTime(args.to, Date.now() / 1000);
			const from = parseTime(args.from, to - 3600);
			const db = getDb(path);
			const where = `stream_id = ? AND event_ts >= ? AND event_ts <= ? AND typeof(json_extract(payload, ?)) IN ('integer', 'real')`;
			const json = `$."${field}"`;
			const summary = db
				.prepare(
					`SELECT COUNT(*) AS count, MIN(json_extract(payload, ?)) AS min, MAX(json_extract(payload, ?)) AS max,
					 AVG(json_extract(payload, ?)) AS mean, MIN(event_ts) AS first, MAX(event_ts) AS last
					 FROM telemetry_history WHERE ${where}`
				)
				.get(json, json, json, streamId, from, to, json) as Record<string, number | null>;
			if (!summary.count) return { streamId, field, count: 0 };
			const at = (order: 'ASC' | 'DESC', by: string) =>
				db
					.prepare(
						`SELECT event_ts AS t, json_extract(payload, ?) AS v FROM telemetry_history
						 WHERE ${where} ORDER BY ${by} ${order} LIMIT 1`
					)
					.get(json, streamId, from, to, json) as { t: number; v: number };
			const peak = at('DESC', 'v');
			const trough = at('ASC', 'v');
			const first = at('ASC', 'event_ts');
			const last = at('DESC', 'event_ts');
			return {
				streamId,
				field,
				from: iso(from),
				to: iso(to),
				count: summary.count,
				min: { value: trough.v, at: iso(trough.t) },
				max: { value: peak.v, at: iso(peak.t) },
				mean: summary.mean,
				first: { value: first.v, at: iso(first.t) },
				last: { value: last.v, at: iso(last.t) }
			};
		}
	},
	{
		name: 'list_alarms',
		title: 'List alarms',
		description: 'Limit violations (WARN = yellow, CRIT = red) in a time range, newest first.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				from: { ...timeArg, description: 'Default "-24h".' },
				to: { ...timeArg, description: 'Default "now".' },
				unacknowledgedOnly: { type: 'boolean', default: false }
			},
			required: ['projectId']
		},
		annotations: readOnly,
		run: (args, access) => {
			const path = project(access, args);
			const to = parseTime(args.to, Date.now() / 1000);
			const from = parseTime(args.from, to - 86_400);
			return limitsDb
				.listLimitEvents(path, from, to, { unackedOnly: args.unacknowledgedOnly === true })
				.map((event) => ({ ...event, time: iso(event.ts) }));
		}
	},
	{
		name: 'acknowledge_alarm',
		title: 'Acknowledge alarm',
		description: 'Acknowledge one alarm by id, or every open alarm when id is "all".',
		inputSchema: {
			type: 'object',
			properties: { projectId: projectArg, id: { type: 'string' } },
			required: ['projectId', 'id']
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		run: (args, access) => {
			const path = project(access, args, 'edit');
			if (args.id === 'all') return { acknowledged: limitsDb.ackAllLimitEvents(path) };
			const id = validateIdentifier(args.id, 'id');
			if (!limitsDb.ackLimitEvent(path, id)) throw new ToolError('Alarm not found');
			return { acknowledged: 1 };
		}
	},
	{
		name: 'set_limits',
		title: 'Set alarm limits',
		description:
			'Set warning (yellow) and critical (red) limits for a stream field. Omitted bounds are cleared. New samples outside the limits raise alarms.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				streamId: { type: 'string' },
				field: { type: 'string', default: 'value' },
				yellowLow: { type: 'number' },
				yellowHigh: { type: 'number' },
				redLow: { type: 'number' },
				redHigh: { type: 'number' },
				enabled: { type: 'boolean', default: true }
			},
			required: ['projectId', 'streamId']
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		run: (args, access) => {
			const path = project(access, args, 'edit');
			const streamId = validateIdentifier(args.streamId, 'streamId');
			const field = fieldName(args.field);
			const bound = (value: unknown) =>
				typeof value === 'number' && Number.isFinite(value) ? value : null;
			limitsDb.setLimitConfig(path, streamId, field, {
				yellowLow: bound(args.yellowLow),
				yellowHigh: bound(args.yellowHigh),
				redLow: bound(args.redLow),
				redHigh: bound(args.redHigh),
				enabled: args.enabled !== false
			});
			return limitsDb.getLimitConfigs(path, streamId).find((limit) => limit.field === field);
		}
	},
	{
		name: 'list_runs',
		title: 'List recorded runs',
		description: 'Recorded runs, newest first, with status and sample counts.',
		inputSchema: {
			type: 'object',
			properties: { projectId: projectArg, limit: { type: 'integer', default: 20 } },
			required: ['projectId']
		},
		annotations: readOnly,
		run: (args, access) => runsDb.listRuns(project(access, args), Number(args.limit ?? 20))
	},
	{
		name: 'control_recording',
		title: 'Control recording',
		description:
			'Start, pause, resume, or stop recording a run. Recording keeps every ingested sample with the run for export and replay.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				action: { type: 'string', enum: ['start', 'pause', 'resume', 'stop'] },
				name: { type: 'string', description: 'Run name when starting' }
			},
			required: ['projectId', 'action']
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
		run: (args, access) => {
			const path = project(access, args, 'edit');
			if (args.action === 'start') {
				return runsDb.startRun(path, typeof args.name === 'string' ? { name: args.name } : {});
			}
			const active = runsDb.getActiveRun(path);
			if (!active) throw new ToolError('No run is recording');
			if (args.action === 'pause') return runsDb.pauseRun(path, active.id);
			if (args.action === 'resume') return runsDb.resumeRun(path, active.id);
			if (args.action === 'stop') return runsDb.stopRun(path, active.id);
			throw new ToolError('action must be start, pause, resume, or stop');
		}
	},
	{
		name: 'add_note',
		title: 'Add log note',
		description:
			'Add a timestamped operator note to the project log. It appears in Alarms & Log views and on the timeline.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				text: { type: 'string', maxLength: 500 },
				details: { type: 'string' },
				time: { ...timeArg, description: 'Default "now".' }
			},
			required: ['projectId', 'text']
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
		run: (args, access) => {
			const path = project(access, args, 'edit');
			const text = String(args.text ?? '').trim();
			if (!text || text.length > 500) throw new ToolError('text must be 1–500 characters');
			const details = typeof args.details === 'string' ? args.details.slice(0, 16_384) : undefined;
			return streamsDb.createAnnotation(
				path,
				parseTime(args.time, Date.now() / 1000),
				text,
				details,
				runsDb.getActiveRun(path)?.id ?? null
			);
		}
	},
	{
		name: 'ingest',
		title: 'Ingest samples',
		description:
			'Write telemetry samples. Each sample is {streamId, timestamp (Unix seconds), values: {field: number|string|boolean}}. Up to 5000 per call.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				samples: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							streamId: { type: 'string' },
							timestamp: { type: 'number' },
							values: { type: 'object' }
						},
						required: ['streamId', 'timestamp', 'values']
					}
				}
			},
			required: ['projectId', 'samples']
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
		run: (args, access) => {
			project(access, args, 'ingest');
			if (!Array.isArray(args.samples)) throw new ToolError('samples must be an array');
			const result = performIngestBatchDetailed(
				String(args.projectId),
				args.samples as streamsDb.IngestSample[]
			);
			return { accepted: result.acceptedCount, runId: result.runId };
		}
	},
	{
		name: 'list_objects',
		title: 'List displays',
		description:
			'The project tree of folders, layouts and views, with their ids, types and settings.',
		inputSchema: {
			type: 'object',
			properties: { projectId: projectArg },
			required: ['projectId']
		},
		annotations: readOnly,
		run: (args, access) => objectsDb.getObjectTree(project(access, args))
	},
	{
		name: 'create_object',
		title: 'Create display',
		description: `Create a folder, layout or view. Types: ${CREATABLE_TYPES.join(', ')}. Containers (folder, grid-layout, flex-layout, tabs, stack) take children through parentId; omit parentId for the project root. Common props: line-plot {dataSources: string[], windowSec}; gauge {dataSource, min, max, unit, warningMax, thresholdMax}; values-table {dataSources: string[]}; ground-track {dataSource, latField, lonField, altField}; scatter-plot {xSource, xField, ySource, yField}; mission-clock {label}; markdown-note {content}; web-page {url}. Unset props get defaults.`,
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				type: { type: 'string', enum: CREATABLE_TYPES },
				name: { type: 'string' },
				parentId: { type: 'string' },
				props: { type: 'object' }
			},
			required: ['projectId', 'type', 'name']
		},
		annotations: { readOnlyHint: false, destructiveHint: false },
		run: (args, access) => {
			const path = project(access, args, 'edit');
			const type = String(args.type);
			if (!CREATABLE_TYPES.includes(type)) throw new ToolError(`Unknown type: ${type}`);
			const tree = objectsDb.getObjectTree(path);
			const parentId = args.parentId ? validateIdentifier(args.parentId, 'parentId') : tree?.id;
			const parent = parentId ? objectsDb.getObject(path, parentId) : null;
			if (!parent) throw new ToolError('Parent not found');
			if (!canContainChildren(parent.type as ObjectType)) {
				throw new ToolError(`A ${parent.type} cannot contain objects`);
			}
			const name =
				String(args.name ?? '')
					.trim()
					.slice(0, 200) || type;
			const props =
				args.props && typeof args.props === 'object' && !Array.isArray(args.props)
					? (args.props as Record<string, unknown>)
					: {};
			return objectsDb.createObject(path, {
				type,
				parentId: parent.id,
				name,
				props: { ...getDefaultPropsForType(type), ...props }
			});
		}
	},
	{
		name: 'update_object',
		title: 'Update display',
		description: 'Rename a display or merge new props into its settings.',
		inputSchema: {
			type: 'object',
			properties: {
				projectId: projectArg,
				objectId: { type: 'string' },
				name: { type: 'string' },
				props: { type: 'object' }
			},
			required: ['projectId', 'objectId']
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		run: (args, access) => {
			const path = project(access, args, 'edit');
			const objectId = validateIdentifier(args.objectId, 'objectId');
			const existing = objectsDb.getObject(path, objectId);
			if (!existing) throw new ToolError('Object not found');
			const props =
				args.props && typeof args.props === 'object' && !Array.isArray(args.props)
					? { ...existing.props, ...(args.props as Record<string, unknown>) }
					: undefined;
			objectsDb.updateObject(path, objectId, {
				name: typeof args.name === 'string' ? args.name.trim().slice(0, 200) : undefined,
				props
			});
			return objectsDb.getObject(path, objectId);
		}
	}
];

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: JsonRpcId;
	method: string;
	params?: Record<string, unknown>;
}

const INSTRUCTIONS =
	'MCS is a telemetry ground station. Start with list_projects, then describe_project to learn stream ids and fields. Times in results are ISO 8601 UTC; time arguments also accept relative values like "-10m". Use stream_stats for peaks (apogee, max pressure) rather than reading raw history.';

function rpcResult(id: JsonRpcId, result: unknown) {
	return { jsonrpc: '2.0' as const, id, result };
}
function rpcError(id: JsonRpcId, code: number, message: string) {
	return { jsonrpc: '2.0' as const, id, error: { code, message } };
}

/** Handle one JSON-RPC message. Notifications return null. */
export function handleMcpMessage(message: unknown, access: McpAccess) {
	if (!message || typeof message !== 'object' || Array.isArray(message)) {
		return rpcError(null, -32600, 'Invalid request');
	}
	const request = message as JsonRpcRequest;
	const id = request.id ?? null;
	if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
		return rpcError(id, -32600, 'Invalid request');
	}
	const isNotification = request.id === undefined;
	if (isNotification) return null;

	switch (request.method) {
		case 'initialize': {
			const requested = String(request.params?.protocolVersion ?? '');
			return rpcResult(id, {
				protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested)
					? requested
					: MCP_PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: SERVER_INFO,
				instructions: INSTRUCTIONS
			});
		}
		case 'ping':
			return rpcResult(id, {});
		case 'tools/list':
			return rpcResult(id, {
				tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
					name,
					title,
					description,
					inputSchema,
					...(annotations ? { annotations } : {})
				}))
			});
		case 'tools/call': {
			const name = String(request.params?.name ?? '');
			const tool = TOOLS.find((candidate) => candidate.name === name);
			if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
			const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
			try {
				const output = tool.run(args, access);
				return rpcResult(id, {
					content: [{ type: 'text', text: JSON.stringify(output, null, 1) }],
					structuredContent: Array.isArray(output) ? { items: output } : (output ?? {}),
					isError: false
				});
			} catch (error) {
				return rpcResult(id, {
					content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
					isError: true
				});
			}
		}
		case 'resources/list':
			return rpcResult(id, { resources: [] });
		case 'prompts/list':
			return rpcResult(id, { prompts: [] });
		default:
			return rpcError(id, -32601, `Method not found: ${request.method}`);
	}
}
