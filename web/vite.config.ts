import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://127.0.0.1:8000';
const proxy = {
  '/v1': { target: API, changeOrigin: true },
  '/health': { target: API, changeOrigin: true },
  '/ready': { target: API, changeOrigin: true },
  '/openapi.json': { target: API, changeOrigin: true },
  '/docs': { target: API, changeOrigin: true },
  '/redoc': { target: API, changeOrigin: true },
  '/mcp': { target: API, changeOrigin: true },
  '/admin/workflows': { target: API, changeOrigin: true },
  '/admin/seed': { target: API, changeOrigin: true },
};

function commitSha(): string {
  const env = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

function testCount(): number {
  const dir = fileURLToPath(new URL('../runtime/tests', import.meta.url));
  let n = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/^test_.*\.py$/.test(name)) continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8');
      n += [...text.matchAll(/^\s*(async )?def test_/gm)].length;
    }
  } catch {
    return 0;
  }
  return n;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __SIGNET_META__: JSON.stringify({
      version: '0.2.0',
      commit: commitSha(),
      tests: testCount(),
    }),
  },
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
