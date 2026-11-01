import { getBrandingAsset } from '$lib/server/branding.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => getBrandingAsset('css');
export const HEAD: RequestHandler = () => getBrandingAsset('css');
