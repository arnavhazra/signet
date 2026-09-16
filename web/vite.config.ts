import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://127.0.0.1:8000';
const proxy = {
  '/v1': { target: API, changeOrigin: true },
  '/health': { target: API, changeOrigin: true },
  '/ready': { target: API, changeOrigin: true },
  '/openapi.json': { target: API, changeOrigin: true },
  '/admin/workflows': { target: API, changeOrigin: true },
  '/admin/seed': { target: API, changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
    proxy,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    proxy,
  },
});
