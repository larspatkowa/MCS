import { getBrandingAsset } from '$lib/server/branding.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => getBrandingAsset('font', params.filename);
export const HEAD: RequestHandler = ({ params }) => getBrandingAsset('font', params.filename);
