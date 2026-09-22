/**
 * Standalone server for the built app. `npm run dev` uses the same handler
 * through a Vite middleware, so there is one code path for label extraction.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleExtract } from './extract.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? 5174);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (url.pathname === '/api/extract') return handleExtract(req, res);

  const requested = normalize(join(DIST, url.pathname));
  const file = requested.startsWith(DIST) && existsSync(requested) && statSync(requested).isFile()
    ? requested
    : join(DIST, 'index.html');

  if (!existsSync(file)) {
    res.statusCode = 404;
    return res.end('Run `npm run build` first.');
  }
  res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Stash Match on http://localhost:${PORT}`));
