/**
 * SDK helpers for out-of-process MCS plugins.
 * Provides simple wrappers for ingesting telemetry, declaring streams, and setting limits.
 */

export interface FieldDeclaration {
	field: string;
	unit?: string;
	min?: number;
	max?: number;
	yellowLow?: number | null;
	yellowHigh?: number | null;
	redLow?: number | null;
	redHigh?: number | null;
}

export interface StreamDeclaration {
	id: string;
	name?: string;
	metadata?: Record<string, unknown>;
	/** Per-field definitions: unit, min/max, and optional limit thresholds. */
	fields?: FieldDeclaration[];
}

export interface IngestSample {
	streamId: string;
	timestamp?: number;
	values?: Record<string, unknown>;
}

export interface IngestOptions {
	projectId?: string;
	timestamp?: number;
	values?: Record<string, unknown>;
}

export interface SDKClientOptions {
	apiUrl?: string;
	projectId?: string;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 7000;

const getApiUrl = (): string => {
	const url = process.env.MCS_API_URL;
	if (!url) throw new Error('MCS_API_URL not set');
	return url.replace(/\/$/, '');
};

const getProjectId = (): string => {
	const id = process.env.MCS_PROJECT_ID;
	if (!id) throw new Error('MCS_PROJECT_ID not set');
	return id;
};

async function request<T>(
	apiUrl: string,
	path: string,
	init: RequestInit,
	timeoutMs: number
): Promise<T> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(`${apiUrl}${path}`, {
			...init,
			signal: controller.signal,
			headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
		});
		clearTimeout(timeoutId);
		if (!response.ok) {
			const text = await response.text();
			throw new Error(`${response.status} ${text}`);
		}
		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('application/json')) return undefined as T;
		return (await response.json()) as T;
	} catch (error) {
		clearTimeout(timeoutId);
		throw error;
	}
}

export function createClient(options: SDKClientOptions = {}) {
	const apiUrl = (options.apiUrl ?? getApiUrl()).replace(/\/$/, '');
	const defaultProjectId = options.projectId ?? getProjectId();
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return {
		async ingest(streamId: string, values?: Record<string, unknown>, opts: IngestOptions = {}) {
			const projectId = opts.projectId ?? defaultProjectId;
			const timestamp = opts.timestamp ?? Date.now() / 1000;
			const payload = values && typeof values === 'object' ? values : {};
			await request<{ ok: boolean }>(
				apiUrl,
				'/ingest',
				{
					method: 'POST',
					body: JSON.stringify({ projectId, streamId, timestamp, values: payload })
				},
				timeoutMs
			);
		},

		async ingestBatch(samples: IngestSample[], projectId?: string): Promise<number> {
			const projId = projectId ?? defaultProjectId;
			const normalized = samples
				.filter((s) => s && s.streamId)
				.map((s) => ({
					streamId: s.streamId,
					timestamp: typeof s.timestamp === 'number' ? s.timestamp : Date.now() / 1000,
					values: s.values && typeof s.values === 'object' ? s.values : {}
				}));
			const res = await request<{ ok: boolean; count: number }>(
				apiUrl,
				'/ingest/batch',
				{ method: 'POST', body: JSON.stringify({ projectId: projId, samples: normalized }) },
				timeoutMs
			);
			return res.count ?? 0;
		},

		async declareStreams(streams: StreamDeclaration[], projectId?: string): Promise<number> {
			const projId = projectId ?? defaultProjectId;
			const res = await request<{ ok: boolean; count: number }>(
				apiUrl,
				`/projects/${projId}/streams/declare`,
				{ method: 'POST', body: JSON.stringify({ streams: streams.filter((s) => s?.id) }) },
				timeoutMs
			);
			return res.count ?? 0;
		},

		async setLimits(
			streamId: string,
			field: string,
			limits: {
				yellowLow?: number | null;
				yellowHigh?: number | null;
				redLow?: number | null;
				redHigh?: number | null;
			},
			projectId?: string
		): Promise<void> {
			const projId = projectId ?? defaultProjectId;
			await request<unknown>(
				apiUrl,
				`/projects/${projId}/streams/${encodeURIComponent(streamId)}/limits`,
				{ method: 'PUT', body: JSON.stringify({ field, ...limits }) },
				timeoutMs
			);
		}
	};
}

/** Create SDK client using MCS_API_URL and MCS_PROJECT_ID from env. */
export function createClientFromEnv() {
	return createClient();
}

/** Convenience: ingest one sample. */
export async function ingest(
	streamId: string,
	values?: Record<string, unknown>,
	options: IngestOptions = {}
): Promise<void> {
	const client = createClient({ projectId: options.projectId });
	await client.ingest(streamId, values, options);
}

/** Convenience: declare streams for a project. */
export async function declareStreams(
	streams: StreamDeclaration[],
	projectId?: string
): Promise<void> {
	const client = createClient({ projectId });
	await client.declareStreams(streams, projectId);
}

/** Convenience: batch ingest samples. */
export async function ingestBatch(samples: IngestSample[], projectId?: string): Promise<number> {
	const client = createClient({ projectId });
	return client.ingestBatch(samples, projectId);
}
