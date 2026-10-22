import { defineConfig } from 'vite';

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(process.env.GLOBE_BUILD_ID || 'development') },
  build: { target: 'es2022' },
  server: { host: '127.0.0.1' },
});
