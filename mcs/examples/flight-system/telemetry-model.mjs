/** Stable, deterministic demo telemetry helpers shared by the seed and sender. */
/** @typedef {{ id: string, center: number, amplitude: number, periodSeconds: number, phase: number }} ChannelSpec */
/** @typedef {{ id: string, name: string, timeSystem: string, timestampUnit: string }} SourceSpec */

/** @param {ChannelSpec} channel @param {number} timestampSeconds */
export function evaluateChannel(channel, timestampSeconds) {
	return Number(
		(
			channel.center +
			channel.amplitude *
				Math.sin((timestampSeconds / channel.periodSeconds) * Math.PI * 2 + channel.phase)
		).toFixed(4)
	);
}

/** @param {{ projectId: string, source: SourceSpec, channels: ChannelSpec[], timestampSeconds: number, sequence?: number }} input */
export function buildTelemetryEnvelope({
	projectId,
	source,
	channels,
	timestampSeconds,
	sequence = Math.floor(timestampSeconds)
}) {
	return {
		version: 1,
		projectId,
		source: {
			id: source.id,
			name: source.name,
			timeSystem: source.timeSystem,
			timestampUnit: source.timestampUnit
		},
		samples: channels.map((channel) => ({
			streamId: channel.id,
			sourceTimestamp: {
				value: timestampSeconds,
				unit: source.timestampUnit,
				timeSystem: source.timeSystem
			},
			sequence,
			idempotencyKey: `${source.id}-${channel.id}-${sequence}`,
			values: { value: evaluateChannel(channel, timestampSeconds) },
			quality: { clock: 'good', flags: ['simulated'] },
			provenance: { generator: 'mcs-flight-system-template', simulated: true }
		}))
	};
}
