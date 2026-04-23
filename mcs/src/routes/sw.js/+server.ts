import type { RequestHandler } from './$types';

const SW_RESPONSE_HEADERS = {
	'Content-Type': 'application/javascript',
	'Cache-Control': 'no-cache'
};

// Return empty service worker to suppress browser requests.
// This prevents 404 errors when browsers try to fetch a previously registered service worker.
export const GET: RequestHandler = async () => {
	return new Response('// No service worker', { headers: SW_RESPONSE_HEADERS });
};

// Some browsers also make HEAD requests before fetching the SW.
export const HEAD: RequestHandler = async () => {
	return new Response(null, { headers: SW_RESPONSE_HEADERS });
};
