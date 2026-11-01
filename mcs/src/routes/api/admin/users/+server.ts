import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createUser, listUsers } from '$lib/server/auth.js';
import { handleApiError } from '$lib/server/errors.js';
import { readJsonObject } from '$lib/server/ingest-validation.js';

export const GET: RequestHandler = () => json({ users: listUsers() });

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await readJsonObject(request);
		if (typeof body.email !== 'string' || typeof body.password !== 'string') {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}
		const user = createUser(
			body.email,
			typeof body.displayName === 'string' ? body.displayName : '',
			body.password,
			locals.authUser?.id
		);
		return json({ user }, { status: 201 });
	} catch (error) {
		return handleApiError(error, 'POST /api/admin/users');
	}
};
