import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      '/v1': { target: API, changeOrigin: true },
      '/health': { target: API, changeOrigin: true },
      '/ready': { target: API, changeOrigin: true },
      // Narrower than `/admin` so the SPA route `/admin` is not swallowed.
      '/admin/workflows': { target: API, changeOrigin: true },
    },
  },
});
