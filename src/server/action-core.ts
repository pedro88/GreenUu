import type { z } from 'zod';
import { DomainError, type ActionResult, type FieldErrors } from '@/lib/errors';
import type { Clock } from './clock';
import type { Executor, Tx } from './db/client';
import type { JobQueue } from './jobs/queues';
import { resolveScope, type Scope } from './authz/scope';
import type { Permission } from './authz/permissions';

/** Acteur authentifié, sans dépendance à Next (testable). */
export type Actor = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  platformRole: 'user' | 'moderator' | 'admin';
  timezone: string;
};

export type ServiceCtx = {
  tx: Tx;
  clock: Clock;
  actor: Actor;
  jobs: JobQueue;
  appUrl: string;
};

export type ScopedCtx = ServiceCtx & { scope: Scope };

export type ActionDeps = {
  /** Base (ou transaction en test : l'action s'exécute alors dans un savepoint). */
  db: Executor;
  clock: Clock;
  appUrl: string;
  jobs: (tx: Tx) => JobQueue;
};

type GardenBound<I> = {
  /** Permission vérifiée par la matrice une fois le jardin résolu. */
  permission: Permission;
  /** D'où vient le jardin à vérifier — jamais cru : c'est l'adhésion qui le valide. */
  gardenId: (input: I) => string;
  handler: (ctx: ScopedCtx, input: I) => Promise<unknown>;
};

type Unbound<I> = {
  permission?: undefined;
  gardenId?: undefined;
  handler: (ctx: ServiceCtx, input: I) => Promise<unknown>;
};

export type ActionDefinition<S extends z.ZodType, R> = {
  name: string;
  input: S;
  /** RG-AUTH-02 : e-mail vérifié requis. */
  requireVerifiedEmail?: boolean;
  /** Lecture seule : aucune revalidation du cache après l'appel (recherche, aperçu…). */
  readOnly?: true;
} & (
  | (Omit<GardenBound<z.output<S>>, 'handler'> & { handler: (ctx: ScopedCtx, input: z.output<S>) => Promise<R> })
  | (Omit<Unbound<z.output<S>>, 'handler'> & { handler: (ctx: ServiceCtx, input: z.output<S>) => Promise<R> })
);

/** Une mutation réussie revalide les pages ; une lecture ne revalide jamais (audit M3). */
export function shouldRevalidate(def: { readOnly?: true }, ok: boolean): boolean {
  return ok && def.readOnly !== true;
}

/** Registre de toutes les actions, utilisé par le test AUTHZ-02 (refus systématique aux non-membres). */
export const actionRegistry = new Map<string, ActionDefinition<z.ZodType, unknown>>();

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Exécute une action : validation Zod, autorisation, transaction, erreurs typées (SPEC §3.4). */
export async function runAction<S extends z.ZodType, R>(
  def: ActionDefinition<S, R>,
  actor: Actor | null,
  raw: unknown,
  deps: ActionDeps,
): Promise<ActionResult<R>> {
  if (!actor) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'unauthenticated' } };
  const parsed = def.input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION', message: 'validation', fieldErrors: zodFieldErrors(parsed.error) } };
  }
  if (def.requireVerifiedEmail && !actor.emailVerified) {
    return { ok: false, error: { code: 'FORBIDDEN', message: 'emailNotVerified' } };
  }
  const input = parsed.data;
  try {
    const data = await deps.db.transaction(async (tx) => {
      const base: ServiceCtx = { tx, clock: deps.clock, actor, jobs: deps.jobs(tx), appUrl: deps.appUrl };
      if (def.permission !== undefined) {
        const scope = await resolveScope(tx, actor.id, def.gardenId(input), def.permission);
        return def.handler({ ...base, scope }, input);
      }
      return def.handler(base, input);
    });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        ok: false,
        error: { code: err.code, message: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) },
      };
    }
    if (isUniqueViolation(err)) return { ok: false, error: { code: 'CONFLICT', message: 'conflict' } };
    console.error(`[action:${def.name}]`, err);
    return { ok: false, error: { code: 'INTERNAL', message: 'internal' } };
  }
}

function isUniqueViolation(err: unknown): boolean {
  const cause = err instanceof Error && 'cause' in err ? err.cause : err;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}
