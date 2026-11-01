import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAuditEvents } from '$lib/server/auth.js';

export const GET: RequestHandler = ({ url }) => {
	const limit = Number(url.searchParams.get('limit') ?? 500);
	return json({ events: listAuditEvents(Number.isFinite(limit) ? limit : 500) });
};
