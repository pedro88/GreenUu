import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Dossier de build distinct pour les e2e : ils tournent à côté d'un `pnpm dev` éventuel.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // forbidden() / forbidden.tsx (page 403 des jardins, SPEC §5.4)
  experimental: { authInterrupts: true },
  serverExternalPackages: ['pg-boss', 'postgres'],
  sassOptions: { silenceDeprecations: ['legacy-js-api'] },
};

export default withNextIntl(nextConfig);
