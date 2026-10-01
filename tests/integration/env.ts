/** Variables d'environnement des tests d'intégration : base `greenu_test`, horloge non figée. */
export function testEnv(): Record<string, string> {
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://greenu:greenu@localhost:5434/greenu_test';
  return {
    NODE_ENV: 'test',
    DATABASE_URL: url,
    APP_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1026',
    MAIL_FROM: 'GreenU <test@greenu.local>',
  };
}
