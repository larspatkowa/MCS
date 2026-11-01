const MAX_PAGE_SIZE = 10_000;
const MAX_REQUEST_SAMPLES = 50_000;

function encoded(value) {
	return encodeURIComponent(value);
}

function asOpenMCTDatum(stream, sample) {
	const eventTimeSeconds = sample.eventTimeUtc ?? sample.timestamp;
	const timestamp = Number(eventTimeSeconds) * 1000;
	return {
		...(sample.values ?? {}),
		utc: timestamp,
		timestamp,
		id: stream.key
	};
}

function isTelemetryObject(domainObject, namespace) {
	return domainObject?.identifier?.namespace === namespace && domainObject.type === 'mcs.telemetry';
}

/**
 * Open MCT plugin that presents one MCS project as a read-only telemetry tree.
 * MCS owns storage and normalization; this adapter maps its seconds-based UTC
 * API to Open MCT's millisecond-based telemetry datums.
 */
export function MCSTelemetryProvider({
	projectId,
	baseUrl = '',
	fetchImpl = globalThis.fetch,
	eventSourceFactory = (url) => new EventSource(url, { withCredentials: true })
}) {
	if (!projectId) throw new Error('projectId is required');
	if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

	const namespace = `mcs.telemetry.${String(projectId).replace(/[^A-Za-z0-9_.-]/g, '_')}`;
	const rootIdentifier = { namespace, key: 'project' };
	const rootKey = rootIdentifier.key;
	const apiRoot = `${baseUrl.replace(/\/$/, '')}/api/projects/${encoded(projectId)}`;
	let metadataPromise;
	let streamsByKey = new Map();
	let streamsById = new Map();
	let connection;

	async function loadStreams() {
		if (!metadataPromise) {
			metadataPromise = fetchImpl(`${apiRoot}/telemetry/metadata`, { credentials: 'same-origin' })
				.then(async (response) => {
					if (!response.ok) throw new Error(`MCS metadata request failed (${response.status})`);
					return response.json();
				})
				.then((body) => {
					const streamList = [];
					const byKey = new Map();
					const byId = new Map();
					for (const source of body.sources ?? []) {
						for (const telemetryStream of source.streams ?? []) {
							const key = `${encoded(source.sourceId)}/${encoded(telemetryStream.streamId)}`;
							const stream = {
								key,
								sourceId: source.sourceId,
								streamId: telemetryStream.streamId,
								sourceName: source.name,
								name: telemetryStream.name,
								description: telemetryStream.description,
								fields: telemetryStream.fields ?? []
							};
							streamList.push(stream);
							byKey.set(key, stream);
							byId.set(`${source.sourceId}\u0000${telemetryStream.streamId}`, stream);
						}
					}
					streamsByKey = byKey;
					streamsById = byId;
					return streamList;
				})
				.catch((error) => {
					metadataPromise = undefined;
					throw error;
				});
		}
		return metadataPromise;
	}

	function childrenFor(streams) {
		return streams.map((stream) => ({ namespace, key: stream.key }));
	}

	function telemetryMetadata(stream) {
		const numericFields = stream.fields.filter((field) => field.type === 'number');
		const primaryRange = numericFields[0]?.key ?? 'value';
		const values = stream.fields
			.filter((field) => field.key !== 'utc')
			.map((field) => ({
				key: field.key,
				name: field.name ?? field.key,
				...(field.unit ? { unit: field.unit } : {}),
				format: field.format ?? (field.type === 'number' ? 'float' : 'string'),
				hints: field.key === primaryRange ? { range: 1 } : {}
			}));
		values.push({
			key: 'utc',
			source: 'timestamp',
			name: 'Timestamp',
			format: 'utc',
			hints: { domain: 1 }
		});
		return { values };
	}

	function getStreamForObject(domainObject) {
		return streamsByKey.get(domainObject?.identifier?.key);
	}

	function openConnection() {
		if (connection) return connection;
		const source = eventSourceFactory(`${apiRoot}/streams/events`);
		const handlers = new Map();
		source.onmessage = (message) => {
			let event;
			try {
				event = JSON.parse(message.data);
			} catch {
				return;
			}
			if (!event.streamId || !event.sourceId) return;
			const stream = streamsById.get(`${event.sourceId}\u0000${event.streamId}`);
			if (!stream) return;
			const streamHandlers = handlers.get(stream.key);
			if (!streamHandlers?.size) return;
			for (const sample of event.samples ?? [event]) {
				for (const callback of streamHandlers) callback(asOpenMCTDatum(stream, sample));
			}
		};
		connection = {
			source,
			handlers,
			add(streamKey, callback) {
				let callbacks = handlers.get(streamKey);
				if (!callbacks) {
					callbacks = new Set();
					handlers.set(streamKey, callbacks);
				}
				callbacks.add(callback);
				return () => {
					callbacks.delete(callback);
					if (callbacks.size === 0) handlers.delete(streamKey);
					if ([...handlers.values()].every((set) => set.size === 0)) {
						source.close();
						connection = undefined;
					}
				};
			}
		};
		return connection;
	}

	async function requestHistory(domainObject, options) {
		const stream = getStreamForObject(domainObject);
		if (!stream) throw new Error('MCS stream metadata is unavailable');
		if (options.domain && options.domain !== 'utc') {
			throw new Error('MCS telemetry adapter supports the Open MCT UTC time system');
		}
		const start = Number(options.start);
		const end = Number(options.end);
		if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
			throw new Error('Open MCT request must provide finite, ordered UTC bounds');
		}

		const strategy = options.strategy;
		const numericField = stream.fields.find((field) => field.type === 'number')?.key ?? 'value';
		const resolution = strategy === 'latest' ? 'latest' : strategy === 'minmax' ? 'minmax' : 'raw';
		const maxSamples =
			resolution === 'latest'
				? 1
				: Math.max(2, Math.min(MAX_PAGE_SIZE, Math.floor(Number(options.size) || MAX_PAGE_SIZE)));
		const samples = [];
		let pageCursor;
		do {
			const query = new URLSearchParams({
				sourceId: stream.sourceId,
				streamId: stream.streamId,
				from: String(start / 1000),
				to: String(end / 1000),
				resolution,
				maxSamples: String(maxSamples)
			});
			if (resolution === 'minmax') query.set('field', numericField);
			if (pageCursor) query.set('pageCursor', pageCursor);
			const response = await fetchImpl(`${apiRoot}/telemetry/history?${query}`, {
				credentials: 'same-origin',
				signal: options.signal
			});
			if (!response.ok) throw new Error(`MCS history request failed (${response.status})`);
			const page = await response.json();
			samples.push(...(page.samples ?? []).map((sample) => asOpenMCTDatum(stream, sample)));
			pageCursor = page.nextPageCursor;
			if (
				samples.length > MAX_REQUEST_SAMPLES ||
				(samples.length === MAX_REQUEST_SAMPLES && pageCursor)
			) {
				throw new Error('MCS history request exceeds 50,000 samples; request minmax resolution');
			}
		} while (pageCursor);
		return samples.sort((a, b) => a.utc - b.utc);
	}

	return function install(openmct) {
		openmct.types.addType('mcs.telemetry', {
			name: 'MCS Telemetry',
			description: 'Read-only telemetry provided by an MCS project',
			creatable: false
		});
		openmct.objects.addRoot(rootIdentifier, openmct.priority?.HIGH);
		openmct.objects.addProvider(namespace, {
			async get(identifier) {
				const streams = await loadStreams();
				if (identifier.key === rootKey) {
					return {
						identifier,
						name: `MCS project ${projectId}`,
						type: 'folder',
						location: 'ROOT',
						composition: childrenFor(streams)
					};
				}
				const stream = streamsByKey.get(identifier.key);
				if (!stream) throw new Error(`Unknown MCS telemetry object: ${identifier.key}`);
				return {
					identifier,
					name: `${stream.sourceName} · ${stream.name}`,
					description: stream.description ?? '',
					type: 'mcs.telemetry',
					location: rootKey,
					telemetry: telemetryMetadata(stream)
				};
			}
		});
		openmct.composition.addProvider({
			appliesTo(domainObject) {
				return (
					domainObject.identifier.namespace === namespace && domainObject.identifier.key === rootKey
				);
			},
			async load() {
				return childrenFor(await loadStreams());
			}
		});
		openmct.telemetry.addProvider({
			supportsRequest: (domainObject) => isTelemetryObject(domainObject, namespace),
			request: requestHistory,
			supportsSubscribe: (domainObject) => isTelemetryObject(domainObject, namespace),
			subscribe(domainObject, callback) {
				const stream = getStreamForObject(domainObject);
				if (!stream) throw new Error('MCS stream metadata is unavailable');
				return openConnection().add(stream.key, callback);
			}
		});
	};
}
