import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProjectPathById } from '$lib/server/project.js';
import { apiErrorResponse } from '$lib/server/errors.js';
import * as mediaDb from '$lib/server/media-db.js';

// The stored MIME type is supplied by the uploader. Only media the player can
// render is served inline; anything else (HTML, SVG, scripts) is downloaded.
const INLINE_MEDIA_TYPES = /^(video|audio)\/[a-z0-9.+-]+$|^image\/(png|jpeg|gif|webp|avif)$/i;

export const GET: RequestHandler = ({ params, request }) => {
	const projectPath = getProjectPathById(params.id);
	if (!projectPath) return apiErrorResponse('Project not found', 404);
	try {
		const asset = mediaDb.getMediaAsset(projectPath, params.assetId);
		if (!asset) return apiErrorResponse('Media asset not found', 404);
		const path = mediaDb.getMediaAssetPath(projectPath, asset.id);
		const size = statSync(path).size;
		const range = request.headers.get('range');
		const inline = INLINE_MEDIA_TYPES.test(asset.mimeType);
		const headers = new Headers({
			'content-type': inline ? asset.mimeType : 'application/octet-stream',
			'accept-ranges': 'bytes',
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "sandbox; default-src 'none'"
		});
		if (!inline) headers.set('content-disposition', 'attachment');
		if (!range) {
			headers.set('content-length', String(size));
			return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers });
		}
		const match = range.match(/^bytes=(\d*)-(\d*)$/);
		if (!match)
			return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
		const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
		const end = match[2] ? Number(match[2]) : size - 1;
		if (
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			start < 0 ||
			end < start ||
			start >= size
		)
			return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
		const boundedEnd = Math.min(end, size - 1);
		headers.set('content-range', `bytes ${start}-${boundedEnd}/${size}`);
		headers.set('content-length', String(boundedEnd - start + 1));
		return new Response(
			Readable.toWeb(createReadStream(path, { start, end: boundedEnd })) as ReadableStream,
			{ status: 206, headers }
		);
	} catch (error) {
		return json(
			{ error: 'Media file is unavailable' },
			{
				status:
					error instanceof Error && error.message === 'Media file is missing from the project'
						? 404
						: 400
			}
		);
	}
};
