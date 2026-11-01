# Open MCT integration

MCS keeps its own versioned ingest envelope, historian API, and project model.
It does not claim that its HTTP endpoints are the Open MCT server protocol.
The read-side contract is deliberately close to Open MCT's telemetry provider
boundary: metadata, bounded history, live subscriptions, UTC event time, and
reduced-resolution queries are available from the MCS telemetry provider.

The example adapter at
[`examples/openmct/telemetry-provider.js`](../examples/openmct/telemetry-provider.js)
registers one MCS project as a read-only Open MCT telemetry tree. It maps MCS
seconds to Open MCT milliseconds, publishes stream field metadata, reads
bounded history (including `latest` and `minmax` strategies), and shares one
resumable MCS SSE connection across Open MCT subscriptions.

## Install the adapter

Copy the example module into the Open MCT application and install it during
startup:

```js
import openmct from 'openmct';
import { MCSTelemetryProvider } from './mcs-telemetry-provider.js';

openmct.install(openmct.plugins.UTCTimeSystem());
openmct.time.setTimeSystem('utc');
openmct.install(MCSTelemetryProvider({ projectId: 'your-project-id' }));
openmct.start();
```

Serve Open MCT and MCS from the same origin, or place both behind a reverse
proxy with the MCS API and event stream reachable from the Open MCT page. The
adapter uses the browser's authenticated session for API requests and the
same-origin EventSource connection. It does not accept or embed acquisition
tokens. Cross-origin deployments need an explicit credentialed CORS and
session-cookie configuration.

The adapter exposes source streams as telemetry objects. MCS object layouts,
annotations, run controls, media tracks, write APIs, and vehicle commands are
not mapped into Open MCT. Telemetry values remain read-only in this integration.

## Time and query behavior

MCS stores normalized event time in Unix UTC seconds while preserving each
sample's original source timestamp, time system, clock quality, and correction
provenance. The adapter exposes that normalized event time as the Open MCT
`utc` time value in milliseconds. Historical bounds are converted from
milliseconds to seconds before requesting MCS history; live events use the same
normalized UTC basis. This aligns views in Open MCT without changing or
discarding source-clock evidence.

Open MCT's `latest` and `minmax` request strategies map to the matching MCS
history resolutions. Raw requests are paged and bounded to 50,000 returned
samples; larger ranges should request `minmax` reduction. The adapter supports
the Open MCT UTC time system. A custom MCS source time system is normalized by
MCS before it reaches this boundary.

## Provider contract

The adapter uses Open MCT's documented object provider, composition provider,
and telemetry provider APIs. The provider API is the supported integration
surface; Open MCT's telemetry consumer APIs for custom visualization plugins
remain documented as draft. See the [Open MCT API reference](https://github.com/nasa/openmct/blob/master/API.md#telemetry-api)
and [Time API](https://github.com/nasa/openmct/blob/master/API.md#time-api).
