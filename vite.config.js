import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { libraryRelease } from './scripts/content/release-plugin.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(process.env.GLOBE_BUILD_ID || 'development') },
  plugins: [libraryRelease({ root })],
  build: { target: 'es2022' },
  server: { host: '127.0.0.1' },
});
