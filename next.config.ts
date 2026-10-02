import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { staticSecurityHeaders } from './src/server/security-headers';

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
  // En-têtes de sécurité (audit M2) ; la CSP à nonce est posée par src/proxy.ts.
  async headers() {
    return [{ source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'production') }];
  },
};

export default withNextIntl(nextConfig);
