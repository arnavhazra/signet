import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(here, '..', 'runtime');
const remote = process.env.PLAYWRIGHT_BASE_URL;

const python = process.env.CI
  ? 'python'
  : path.join(runtime, '.venv', 'bin', 'python');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: remote || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : [
        {
          command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
          cwd: runtime,
          url: 'http://127.0.0.1:8000/health',
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            TESTING: '1',
            DEMO_MODE: '1',
            SIGNET_BOOTSTRAP: '1',
            DATABASE_URL: 'sqlite+aiosqlite:///:memory:',
            JWT_SECRET: 'test-jwt-secret',
            API_KEYS: 'test-runtime-key',
            OTEL_EXPORTER_OTLP_ENDPOINT: '',
            RATE_LIMIT_PER_MINUTE: '1000',
          },
        },
        {
          command: 'npm run preview -- --host 127.0.0.1 --port 4173',
          cwd: here,
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env.CI,
        },
      ],
});
