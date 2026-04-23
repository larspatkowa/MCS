import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const root = resolve(process.argv[2] ?? 'build');
const port = Number(process.env.PORT ?? process.argv[3] ?? 4173);

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8'
};

function toFilePath(urlPath) {
	const pathOnly = decodeURIComponent(urlPath.split('?')[0] ?? '/');
	const normalized = pathOnly.replaceAll('\\', '/');
	// `req.url` is a URL path (usually starting with `/`), not a filesystem path.
	// Strip the leading slash so `path.join(root, ...)` can't accidentally drop `root`.
	const relative = normalized.startsWith('/') ? normalized.slice(1) : normalized;

	if (relative === '' || relative === '/') return join(root, 'index.html');
	if (relative.endsWith('/')) return join(root, relative, 'index.html');

	const hasExt = extname(relative) !== '';
	if (hasExt) return join(root, relative);

	// adapter-static defaults to flat `path.html` outputs (e.g. /components → components.html).
	// Fall back to folder/index.html in case config changes.
	const htmlPath = join(root, `${relative}.html`);
	if (existsSync(htmlPath)) return htmlPath;
	return join(root, relative, 'index.html');
}

function safeWithinRoot(filePath) {
	const resolved = resolve(filePath);
	return resolved === root || resolved.startsWith(root + '/');
}

const server = createServer(async (req, res) => {
	try {
		const filePath = toFilePath(req.url ?? '/');
		if (!safeWithinRoot(filePath)) {
			res.statusCode = 400;
			res.end('Bad request');
			return;
		}

		if (!existsSync(filePath) || !statSync(filePath).isFile()) {
			res.statusCode = 404;
			res.end('Not found');
			return;
		}

		const ext = extname(filePath).toLowerCase();
		res.setHeader('content-type', MIME[ext] ?? 'application/octet-stream');
		res.setHeader('cache-control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
		res.statusCode = 200;
		res.end(await readFile(filePath));
	} catch (e) {
		res.statusCode = 500;
		res.end(e instanceof Error ? e.message : 'Server error');
	}
});

server.listen(port, () => {
	// eslint-disable-next-line no-console
	console.log(`[docs-site] serving ${root} on http://localhost:${port}`);
});

