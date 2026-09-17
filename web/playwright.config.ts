import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(here, '..', 'runtime');
const remote = process.env.PLAYWRIGHT_BASE_URL;

const python = process.env.CI
  ? 'python'
  : path.join(runtime, '.venv', 'bin', 'python');

const preview = process.env.CI
  ? 'npm run preview -- --host 127.0.0.1 --port 4173'
  : 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: remote || process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: remote || 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    storageState: { cookies: [], origins: [] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : [
        {
          command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
          cwd: runtime,
          url: 'http://127.0.0.1:8000/health',
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            TESTING: '1',
            DEMO_MODE: '1',
            SIGNET_BOOTSTRAP: '1',
            DATABASE_URL: 'sqlite+aiosqlite:///:memory:',
            JWT_SECRET: 'dev-jwt-secret-change-me',
            API_KEYS: 'demo-runtime-key',
            OTEL_EXPORTER_OTLP_ENDPOINT: '',
            RATE_LIMIT_PER_MINUTE: '1000',
          },
        },
        {
          command: preview,
          cwd: here,
          url: 'http://127.0.0.1:4173',
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
