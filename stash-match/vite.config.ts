import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error — plain JS module, shared with the standalone server.
import { handleExtract } from './server/extract.mjs';

/** Serves /api/extract in dev so the API key stays out of the browser bundle. */
const extractApi: Plugin = {
  name: 'stash-match-extract-api',
  configureServer(server: ViteDevServer) {
    server.middlewares.use('/api/extract', handleExtract);
  },
};

export default defineConfig({
  plugins: [react(), extractApi],
  server: { host: true, port: 5173 },
});
