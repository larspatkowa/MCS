import { basename, join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';

export function getUserPluginsDir(): string {
	return join(process.cwd(), 'data', 'user-plugins');
}

export function ensureUserPluginsDir(): void {
	mkdirSync(getUserPluginsDir(), { recursive: true });
}

/**
 * Single-segment filename only, .mjs or .py
 */
export function safeUserPluginFilename(name: string): string | null {
	const base = basename(name);
	if (base !== name || base.includes('..')) return null;
	if (!/^[\w-]+\.(mjs|py)$/i.test(base)) return null;
	return base;
}

export function listUserPluginFiles(): string[] {
	const dir = getUserPluginsDir();
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter((f) => f.endsWith('.mjs') || f.endsWith('.py'));
}

export function readUserPluginFile(filename: string): string {
	const safe = safeUserPluginFilename(filename);
	if (!safe) throw new Error('Invalid filename');
	const path = join(getUserPluginsDir(), safe);
	if (!existsSync(path)) throw new Error('Not found');
	return readFileSync(path, 'utf-8');
}

export function writeUserPluginFile(filename: string, content: string): void {
	const safe = safeUserPluginFilename(filename);
	if (!safe) throw new Error('Invalid filename');
	ensureUserPluginsDir();
	writeFileSync(join(getUserPluginsDir(), safe), content, 'utf-8');
}

export function deleteUserPluginFile(filename: string): void {
	const safe = safeUserPluginFilename(filename);
	if (!safe) throw new Error('Invalid filename');
	const path = join(getUserPluginsDir(), safe);
	if (!existsSync(path)) throw new Error('Not found');
	unlinkSync(path);
}

const TEMPLATE_MJS = `/**
 * MCS user plugin (Node). Env: MCS_API_URL, MCS_PROJECT_ID, MCS_PLUGIN_ID
 * POST samples to /ingest on the MCS API base URL.
 */
const apiUrl = (process.env.MCS_API_URL || '').replace(/\\/$/, '');
const projectId = process.env.MCS_PROJECT_ID || '';
const streamId = 'user-demo:signal';

async function postSample(value) {
  const res = await fetch(\`\${apiUrl}/ingest\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      streamId,
      timestamp: Date.now() / 1000,
      values: { value }
    })
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('ingest failed', res.status, t);
  }
}

let n = 0;
setInterval(() => {
  n += 1;
  postSample(Math.sin(n / 5) * 10).catch((e) => console.error(e));
}, 1000);

console.log('user plugin started', { streamId });
`;

const TEMPLATE_PY = `"""MCS user plugin (Python). Env: MCS_API_URL, MCS_PROJECT_ID"""
import os
import time
import urllib.request
import json

api_url = os.environ.get("MCS_API_URL", "").rstrip("/")
project_id = os.environ.get("MCS_PROJECT_ID", "")
stream_id = "user-demo:signal"

def post_sample(value: float) -> None:
    body = {
        "projectId": project_id,
        "streamId": stream_id,
        "timestamp": time.time(),
        "values": {"value": value},
    }
    req = urllib.request.Request(
        f"{api_url}/ingest",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status >= 400:
                print("ingest failed", resp.status, resp.read().decode())
    except Exception as e:
        print("ingest error", e)

n = 0
print("user plugin started", stream_id)
while True:
    n += 1
    import math
    post_sample(math.sin(n / 5) * 10)
    time.sleep(1)
`;

export function defaultTemplate(ext: 'mjs' | 'py'): string {
	return ext === 'py' ? TEMPLATE_PY : TEMPLATE_MJS;
}
