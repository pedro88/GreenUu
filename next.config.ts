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
    return [
      { source: '/:path*', headers: staticSecurityHeaders(process.env.NODE_ENV === 'production') },
      // Service worker (lot 9) : jamais mis en cache, pour qu'une nouvelle version soit prise aussitôt.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Content-Type', value: 'application/javascript; charset=utf-8' }] },
    ];
  },
};

export default withNextIntl(nextConfig);
