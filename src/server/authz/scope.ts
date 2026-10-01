import { and, eq, isNull } from 'drizzle-orm';
import { forbidden } from '@/lib/errors';
import type { Executor } from '../db/client';
import { garden, gardenGroup, gardenMember, groupMember } from '../db/schema';
import { evaluate, type GardenSettings, type Permission, type ResourceFacts, type Role } from './permissions';

/** Contexte d'autorisation d'un utilisateur dans un jardin (SPEC §3.3). */
export type Scope = {
  userId: string;
  gardenId: string;
  memberId: string;
  role: Role;
  groupIds: string[];
  settings: GardenSettings;
  archived: boolean;
  orgType: string;
};

/** Permissions encore possibles sur un jardin archivé (RG-GRD-04). */
const ALLOWED_WHEN_ARCHIVED: ReadonlySet<Permission> = new Set<Permission>([
  'garden:read',
  'garden:read_location',
  'garden:archive',
  'garden:delete',
  'garden:export',
  'member:leave',
]);

export async function loadScope(tx: Executor, userId: string, gardenId: string): Promise<Scope | null> {
  const [row] = await tx
    .select({
      memberId: gardenMember.id,
      role: gardenMember.role,
      archivedAt: garden.archivedAt,
      planEditMinRole: garden.planEditMinRole,
      decorMinRole: garden.decorMinRole,
      orgType: garden.orgType,
    })
    .from(gardenMember)
    .innerJoin(garden, eq(garden.id, gardenMember.gardenId))
    .where(
      and(
        eq(gardenMember.gardenId, gardenId),
        eq(gardenMember.userId, userId),
        isNull(gardenMember.leftAt),
        isNull(garden.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const groups = await tx
    .select({ id: groupMember.groupId })
    .from(groupMember)
    .innerJoin(gardenGroup, eq(gardenGroup.id, groupMember.groupId))
    .where(and(eq(groupMember.memberId, row.memberId), isNull(gardenGroup.archivedAt)));
  return {
    userId,
    gardenId,
    memberId: row.memberId,
    role: row.role,
    groupIds: groups.map((g) => g.id),
    settings: { planEditMinRole: row.planEditMinRole, decorMinRole: row.decorMinRole },
    archived: row.archivedAt !== null,
    orgType: row.orgType,
  };
}

export function can(scope: Scope, permission: Permission, facts?: ResourceFacts): boolean {
  if (scope.archived && !ALLOWED_WHEN_ARCHIVED.has(permission)) return false;
  return evaluate(permission, scope.role, scope.settings, facts);
}

export function assertCan(scope: Scope, permission: Permission, facts?: ResourceFacts): void {
  if (!can(scope, permission, facts)) throw forbidden(scope.archived ? 'gardenArchived' : 'forbidden');
}

/**
 * Point d'entrée unique : l'utilisateur doit être membre actif du jardin.
 * Les règles dépendant de la ressource (`own`…) sont revérifiées par le service avec `assertCan`.
 */
export async function resolveScope(
  tx: Executor,
  userId: string,
  gardenId: string,
  permission: Permission,
  facts?: ResourceFacts,
): Promise<Scope> {
  const scope = await loadScope(tx, userId, gardenId);
  if (!scope) throw forbidden('notMember');
  const ruleDependsOnResource = facts === undefined && requiresFacts(scope, permission);
  if (!ruleDependsOnResource) assertCan(scope, permission, facts);
  return scope;
}

/** Vrai si la règle du rôle dépend de la ressource : la vérification est alors déléguée au service. */
function requiresFacts(scope: Scope, permission: Permission): boolean {
  if (scope.archived && !ALLOWED_WHEN_ARCHIVED.has(permission)) return false;
  return !evaluate(permission, scope.role, scope.settings, {}) &&
    evaluate(permission, scope.role, scope.settings, { isOwn: true, isAssigned: true, isUnassigned: true });
}
