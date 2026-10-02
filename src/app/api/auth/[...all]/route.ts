import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth/auth';

/**
 * Les parcours de compte passent par nos Server Actions (validation, profil, CGU, limitation par e-mail) :
 * seuls les endpoints de session restent exposés en HTTP. Tout autre chemin répond 404 (audit M1).
 */
const EXPOSED_AUTH_PATHS: ReadonlySet<string> = new Set(['/get-session', '/sign-out']);

function isExposed(req: Request): boolean {
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, '');
  return EXPOSED_AUTH_PATHS.has(path);
}

const notFound = () => new Response(null, { status: 404 });

export const GET = (req: Request) => (isExposed(req) ? toNextJsHandler(auth()).GET(req) : notFound());
export const POST = (req: Request) => (isExposed(req) ? toNextJsHandler(auth()).POST(req) : notFound());
