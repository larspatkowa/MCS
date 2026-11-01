#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildTelemetryEnvelope } from './telemetry-model.mjs';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const project = JSON.parse(await readFile(path.join(projectDirectory, 'project.json'), 'utf8'));
const seed = JSON.parse(await readFile(new URL('./seed.json', import.meta.url), 'utf8'));

const endpoint = process.env.MCS_INGEST_URL ?? 'http://127.0.0.1:5173/api/ingest/v2';
const controller = new AbortController();
let stopping = false;
let lastSequence = Math.floor(Date.now() / 1000);

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.once(signal, () => {
		stopping = true;
		controller.abort();
	});
}

console.log(`Sending simulated telemetry for ${project.name} to ${endpoint}`);
console.log('No commands are sent. Press Ctrl+C to stop.');

while (!stopping) {
	const timestampSeconds = Date.now() / 1000;
	lastSequence = Math.max(lastSequence + 1, Math.floor(timestampSeconds));
	const envelope = buildTelemetryEnvelope({
		projectId: project.id,
		source: seed.source,
		channels: seed.channels,
		timestampSeconds,
		sequence: lastSequence
	});
	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(envelope),
			signal: controller.signal
		});
		if (!response.ok) {
			const detail = await response.text();
			console.error(`Ingest returned ${response.status}: ${detail.slice(0, 400)}`);
		} else {
			const result = await response.json();
			console.log(
				`sequence ${lastSequence}: accepted ${result.accepted}/${result.received} samples`
			);
		}
	} catch (error) {
		if (stopping) break;
		console.error(
			`Telemetry send failed: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	if (stopping) break;
	await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.log('Telemetry simulator stopped.');
