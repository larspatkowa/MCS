import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function globalTeardown() {
	// The test server is configured to use this dedicated directory. Removing one
	// exact test root is safer than trying to recognize test projects in user data.
	rmSync(resolve('.mcs-e2e'), { recursive: true, force: true });
}
