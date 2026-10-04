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
  { ignores: ['.next/**', '.next-e2e/**', 'node_modules/**', 'var/**', 'drizzle/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'] },
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.ts', '**/*.tsx'],
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
      // POL-01 : sans `method`, un formulaire soumis avant l'hydratation part en GET, champs (mot de passe, jetons)
      // dans l'URL. Tout <form> déclare sa méthode.
      'no-restricted-syntax': ['error', { selector: "JSXOpeningElement[name.name='form']:not(:has(JSXAttribute[name.name='method']))", message: 'Un <form> déclare method="post" : avant l\'hydratation, un GET mettrait les champs dans l\'URL (POL-01).' }],
      // <img> volontaire : photos privées servies après contrôle d'accès (pas de cache d'optimisation partagé)
      // et pixel art affiché à l'échelle entière sans lissage.
      '@next/next/no-img-element': 'off',
    },
  },
  {
    files: ['src/app/**/*.tsx', 'src/features/*/ui/**/*.tsx', 'src/components/**/*.tsx'],
    plugins: { greenu: local },
    rules: { 'greenu/no-literal-jsx-text': 'error' },
  },
  {
    files: ['src/features/*/service.ts', 'src/features/*/repo.ts', 'src/features/**/*.pure.ts', 'src/lib/**/*.ts', 'src/server/authz/**/*.ts', 'src/server/events/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', noNextInDomain] },
  },
  {
    files: ['src/app/**', 'src/features/*/ui/**', 'src/components/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/server/db/schema', '@/server/db/schema/*', '@/features/*/repo', 'drizzle-orm', 'drizzle-orm/*'], message: "L'UI passe par les services ou les actions, jamais par le schéma ni les dépôts (SPEC §3.2)." }] }],
    },
  },
);
