import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import local from './eslint/local-rules.mjs';

const noNextInDomain = {
  patterns: [
    { group: ['next', 'next/*', 'next-intl', 'next-intl/*', 'react', 'react-dom'], message: 'La couche service / dépôt / lib ne dépend pas de Next ni de React (SPEC §3.2).' },
  ],
};

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'var/**', 'drizzle/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...nextVitals,
  ...nextTs,
  {
    plugins: { greenu: local },
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
      'greenu/justified-as': 'error',
    },
  },
  {
    files: ['src/app/**/*.tsx', 'src/features/*/ui/**/*.tsx', 'src/components/**/*.tsx'],
    rules: { 'greenu/no-literal-jsx-text': 'error' },
  },
  {
    files: ['src/features/*/service.ts', 'src/features/*/repo.ts', 'src/features/**/*.pure.ts', 'src/lib/**/*.ts', 'src/server/authz/**/*.ts', 'src/server/events/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', noNextInDomain] },
  },
  {
    files: ['src/app/**', 'src/features/*/ui/**', 'src/components/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/server/db', '@/server/db/*', '@/features/*/repo'], message: "L'UI passe par les services ou les actions, jamais par l'accès données (SPEC §3.2)." }] }],
    },
  },
);
