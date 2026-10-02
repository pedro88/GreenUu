import { defineConfig, devices } from '@playwright/test';
import { E2E_NOW, TEST_DB } from './tests/e2e/db';

const PORT = 3100;

/** E2E sur la base `greenu_test`, remise à zéro et seedée au démarrage du serveur (SPEC §13). */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'reports/playwright.json' }], ['html', { open: 'never' }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', locale: 'fr-FR', timezoneId: 'Europe/Brussels' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /kanban\.spec\.ts/ },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /(a11y|kanban)\.spec\.ts/ },
  ],
  webServer: {
    command: `tsx scripts/reset.ts ${TEST_DB} && concurrently -k -n next,worker "next dev --port ${PORT}" "tsx src/server/jobs/worker.ts"`,
    url: `http://localhost:${PORT}/connexion`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DB,
      APP_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1026',
      MAIL_FROM: 'GreenU <no-reply@greenu.test>',
      NEXT_DIST_DIR: '.next-e2e',
      // Une seule source de « maintenant » pour le seed et le serveur : la suite ne dépend plus du jour réel.
      APP_NOW: E2E_NOW,
      SEED_REFERENCE_DATE: E2E_NOW,
      // Serveur Node dans un autre fuseau que le navigateur (Europe/Brussels) et que l'UTC.
      TZ: 'America/New_York',
    },
  },
});
