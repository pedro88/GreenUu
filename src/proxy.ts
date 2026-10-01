import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirection optimiste des pages /app sans cookie de session (AUTH-09).
 * La vraie vérification est faite côté serveur (layout /app). Transmet le chemin demandé en en-tête.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname + search);
  if ((pathname === '/app' || pathname.startsWith('/app/') || pathname === '/bienvenue') && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|webp|ico)$).*)'],
};
