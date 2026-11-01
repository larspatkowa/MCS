import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { removeProjectMembership } from '$lib/server/auth.js';
import { getProjectPathById } from '$lib/server/project.js';
import { validateIdentifier } from '$lib/server/ingest-validation.js';
import { handleApiError } from '$lib/server/errors.js';

export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!getProjectPathById(params.id)) return json({ error: 'Project not found' }, { status: 404 });
	try {
		return json({
			ok: removeProjectMembership(
				params.id,
				validateIdentifier(params.userId, 'userId'),
				locals.authUser?.id
			)
		});
	} catch (error) {
		return handleApiError(error, 'DELETE /api/admin/projects/[id]/members/[userId]');
	}
};
