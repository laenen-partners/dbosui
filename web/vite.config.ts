import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Use relative asset URLs so the SPA works under any mount path. The Go server
// rewrites <base href="/"> in index.html at serve time to the configured base
// path so React Router and asset URLs resolve correctly.
//
// API_PORT / PORT come from .env (loaded by mise) so the Vite proxy targets
// the same port that air launches the Go API on.
const apiPort = process.env.API_PORT ?? process.env.PORT ?? '8080';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    // highlight.js bundles ~38 languages via its default entry. We only need
    // JSON, so rewrite *only* the bare `highlight.js` import to the core entry
    // (~8 kB). Subpath imports like `highlight.js/lib/languages/json` are
    // unaffected. Languages are registered explicitly in src/lib/hljs.ts.
    alias: [
      { find: /^highlight\.js$/, replacement: 'highlight.js/lib/core' },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
