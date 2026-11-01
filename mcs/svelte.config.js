import nodeAdapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: nodeAdapter(),
		// SvelteKit adds a nonce to its own scripts and to app.html's theme
		// script. Inline styles stay allowed because components set style
		// attributes at runtime. Web page views may frame any http(s) page.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'media-src': ['self', 'blob:'],
				'font-src': ['self', 'data:'],
				'connect-src': ['self'],
				'frame-src': ['http:', 'https:'],
				'worker-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
