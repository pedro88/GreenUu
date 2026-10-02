import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Fuseau du processus épinglé et différent du fuseau des jardins (Europe/Brussels) et de l'UTC : un code qui
 * dépendrait du fuseau de la machine échouerait ici (audit e2e 2026-10-02). `TEST_TZ` permet d'en essayer un autre.
 */
process.env.TZ = process.env.TEST_TZ ?? 'America/New_York';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'eslint/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/integration/setup.ts'],
          globalSetup: ['tests/integration/global-setup.ts'],
          // Une seule base de test : les fichiers s'exécutent en série, chaque test dans une transaction annulée.
          fileParallelism: false,
        },
      },
    ],
    reporters: ['default', ['json', { outputFile: 'reports/vitest.json' }]],
  },
});
