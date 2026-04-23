import { registerSampleTelemetryPlugin } from './sample-telemetry-plugin.js';
import { registerRocketMissionPlugin } from './rocket-mission-plugin.js';
import { registerSystemSensorPlugin } from './system-sensor-plugin.js';
import { registerAgriNdviMissionPlugin } from './agri-ndvi-mission-plugin.js';

export function bootstrapBuiltInPlugins(): void {
	registerSampleTelemetryPlugin();
	registerRocketMissionPlugin();
	registerSystemSensorPlugin();
	registerAgriNdviMissionPlugin();
}
