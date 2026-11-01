import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../../../hooks.server.js';
import { getBrandingAsset } from '../branding.js';
import { stopTelemetryRetentionCleanup } from '../retention.js';

let root: string;
const originalConfigDir = process.env.MCS_CONFIG_DIR;
const originalAuthRequired = process.env.MCS_AUTH_REQUIRED;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'mcs-branding-'));
	process.env.MCS_CONFIG_DIR = join(root, 'config');
	process.env.MCS_AUTH_REQUIRED = '1';
});

afterEach(() => {
	stopTelemetryRetentionCleanup();
	if (originalConfigDir === undefined) delete process.env.MCS_CONFIG_DIR;
	else process.env.MCS_CONFIG_DIR = originalConfigDir;
	if (originalAuthRequired === undefined) delete process.env.MCS_AUTH_REQUIRED;
	else process.env.MCS_AUTH_REQUIRED = originalAuthRequired;
	rmSync(root, { recursive: true, force: true });
});

describe('operator branding assets', () => {
	it('serves a quiet empty stylesheet when the override is absent', async () => {
		const response = getBrandingAsset('css');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
		expect(await response.text()).toBe('');
	});

	it('serves CSS and supported font files from the branding directory', async () => {
		const branding = join(process.env.MCS_CONFIG_DIR!, 'branding');
		mkdirSync(join(branding, 'fonts'), { recursive: true });
		writeFileSync(join(branding, 'branding.css'), '@font-face { src: url(./fonts/Test.woff2); }');
		writeFileSync(join(branding, 'fonts', 'Test.woff2'), Buffer.from([0, 1, 2, 3]));

		const css = getBrandingAsset('css');
		const font = getBrandingAsset('font', 'Test.woff2');
		expect(css.status).toBe(200);
		expect(await css.text()).toContain('url(./fonts/Test.woff2)');
		expect(font.status).toBe(200);
		expect(font.headers.get('content-type')).toBe('font/woff2');
		expect(Array.from(new Uint8Array(await font.arrayBuffer()))).toEqual([0, 1, 2, 3]);
	});

	it('does not serve unsupported extensions, traversal, or symlink escapes', async () => {
		const branding = join(process.env.MCS_CONFIG_DIR!, 'branding');
		mkdirSync(join(branding, 'fonts'), { recursive: true });
		writeFileSync(join(branding, 'fonts', 'notes.txt'), 'not a font');
		writeFileSync(join(root, 'outside.woff2'), 'outside');
		symlinkSync(join(root, 'outside.woff2'), join(branding, 'fonts', 'Escape.woff2'));

		expect(getBrandingAsset('font', 'notes.txt').status).toBe(404);
		expect(getBrandingAsset('font', '../outside.woff2').status).toBe(404);
		expect(getBrandingAsset('font', 'Escape.woff2').status).toBe(404);
	});

	it('allows branding through the auth hook while keeping app pages protected', async () => {
		const brandingRequest = new Request('http://localhost/branding/branding.css');
		const brandingEvent = {
			request: brandingRequest,
			cookies: { get: () => undefined },
			locals: {}
		} as unknown as Parameters<typeof handle>[0]['event'];
		let brandingResolved = false;
		const brandingResult = await handle({
			event: brandingEvent,
			resolve: async () => {
				brandingResolved = true;
				return getBrandingAsset('css');
			}
		});

		const pageEvent = {
			request: new Request('http://localhost/'),
			cookies: { get: () => undefined },
			locals: {}
		} as unknown as Parameters<typeof handle>[0]['event'];
		const pageResult = await handle({
			event: pageEvent,
			resolve: async () => new Response('page')
		});

		expect(brandingResolved).toBe(true);
		expect(brandingResult.status).toBe(200);
		expect(pageResult.status).toBe(303);
		expect(pageResult.headers.get('location')).toBe('/login');
	});
});
