import { defineConfig, devices } from '@playwright/test';
import { extensionOrigin } from './tests/fixtures/extension-identity';

// Exercise the built SPA and the real API together, just as production does.
// Dedicated ports and an explicit E2E database prevent reusing a developer server.
const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4400';
const webURL = process.env.E2E_BASE_URL || apiURL;
const fixtureURL = process.env.E2E_FIXTURE_URL || 'http://localhost:4174';
const external = process.env.E2E_EXTERNAL_SERVERS === '1';
const database = process.env.E2E_DATABASE_URL;
if (!external && !database) throw new Error('Set E2E_DATABASE_URL to a dedicated migrated/test PostgreSQL database (not production).');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: webURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'web-chromium', testIgnore: '**/extension.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'extension-chromium', testMatch: '**/extension.spec.ts' },
  ],
  webServer: [
    ...(!external ? [{
      command: 'npm run db:migrate && npm start',
      url: `${apiURL}/api/ready`, reuseExistingServer: false, timeout: 120_000,
      env: {
        NODE_ENV: 'test', DATABASE_URL: database!,
        JWT_SECRET: 'e2e-only-not-a-production-secret-0123456789-abcdef',
        HOST: new URL(apiURL).hostname, PORT: new URL(apiURL).port || '4400',
        WEB_ORIGINS: new URL(webURL).origin, EXTENSION_ORIGINS: extensionOrigin,
      },
    }] : []),
    { command: 'node tests/fixtures/server.mjs', url: `${fixtureURL}/health`, reuseExistingServer: false, timeout: 30_000, env: { FIXTURE_PORT: new URL(fixtureURL).port || '4174' } },
  ],
});
