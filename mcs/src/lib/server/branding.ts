import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { getConfigDir } from './config.js';

export const MAX_BRANDING_CSS_BYTES = 512 * 1024;
export const MAX_BRANDING_FONT_BYTES = 20 * 1024 * 1024;

const FONT_TYPES: Record<string, string> = {
	'.eot': 'application/vnd.ms-fontobject',
	'.otf': 'font/otf',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2'
};

/**
 * Resolve one operator-owned branding file without allowing paths or symlinks
 * to escape the branding directory. CSS is always present as an empty response
 * when no override has been installed.
 */
export function getBrandingAsset(kind: 'css' | 'font', filename?: string): Response {
	if (kind === 'font' && !isFlatFontFilename(filename)) return notFound();
	const brandingDirectory = join(getConfigDir(), 'branding');
	let brandingRoot: string;
	try {
		const rootInfo = lstatSync(brandingDirectory);
		if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
			return kind === 'css' ? emptyStylesheet() : notFound();
		}
		brandingRoot = realpathSync(brandingDirectory);
	} catch {
		return kind === 'css' ? emptyStylesheet() : notFound();
	}

	const assetName = kind === 'css' ? 'branding.css' : filename!;
	const assetPath = join(
		brandingRoot,
		kind === 'css' ? assetName : 'fonts',
		...(kind === 'font' ? [assetName] : [])
	);
	const expectedDirectory = kind === 'css' ? brandingRoot : join(brandingRoot, 'fonts');
	const maxBytes = kind === 'css' ? MAX_BRANDING_CSS_BYTES : MAX_BRANDING_FONT_BYTES;
	const contentType =
		kind === 'css' ? 'text/css; charset=utf-8' : FONT_TYPES[assetExtension(assetName)]!;

	let fileDescriptor: number | undefined;
	try {
		const directoryInfo = lstatSync(expectedDirectory);
		if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) return notFound();
		const canonicalDirectory = realpathSync(expectedDirectory);
		if (canonicalDirectory !== brandingRoot && canonicalDirectory !== expectedDirectory)
			return notFound();
		const info = lstatSync(assetPath);
		if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) {
			return info.size > maxBytes ? tooLarge() : notFound();
		}
		const canonicalPath = realpathSync(assetPath);
		if (
			resolve(canonicalPath).slice(0, resolve(canonicalDirectory).length + 1) !==
			`${resolve(canonicalDirectory)}${sep}`
		) {
			return notFound();
		}
		fileDescriptor = openSync(assetPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
		const openedInfo = fstatSync(fileDescriptor);
		if (!openedInfo.isFile() || openedInfo.size > maxBytes) {
			return openedInfo.size > maxBytes ? tooLarge() : notFound();
		}
		const body = readFileSync(fileDescriptor);
		if (body.byteLength > maxBytes) return tooLarge();
		return new Response(body, { headers: assetHeaders(contentType) });
	} catch {
		return kind === 'css' ? emptyStylesheet() : notFound();
	} finally {
		if (fileDescriptor !== undefined) closeSync(fileDescriptor);
	}
}

function isFlatFontFilename(filename: string | undefined): filename is string {
	if (!filename || filename === '.' || filename === '..') return false;
	if (filename.includes('/') || filename.includes('\\') || filename.includes('\0')) return false;
	if (filename.startsWith('.')) return false;
	return Object.hasOwn(FONT_TYPES, assetExtension(filename));
}

function assetExtension(filename: string): string {
	const dot = filename.lastIndexOf('.');
	return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

function assetHeaders(contentType: string): HeadersInit {
	return {
		'Content-Type': contentType,
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff'
	};
}

function emptyStylesheet(): Response {
	return new Response(null, { headers: assetHeaders('text/css; charset=utf-8') });
}

function notFound(): Response {
	return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function tooLarge(): Response {
	return new Response(null, { status: 413, headers: { 'Cache-Control': 'no-store' } });
}
