import type { Role } from './permissions';

/** Restrictions de zone par groupe (SPEC §5.3). */

export type ZoneRestriction = { groupId: string; level: 'edit' | 'contribute' };

export type ZoneAccessNeed = 'edit' | 'contribute';

/**
 * `chainFromRoot` : restrictions de chaque zone, de la racine jusqu'à la zone visée (incluse).
 * La restriction effective est celle de l'ancêtre restreint le plus proche (ou de la zone elle-même).
 */
export function effectiveRestriction(chainFromRoot: ZoneRestriction[][]): ZoneRestriction[] | null {
  for (let i = chainFromRoot.length - 1; i >= 0; i--) {
    const r = chainFromRoot[i];
    if (r && r.length > 0) return r;
  }
  return null;
}

export function zoneAllows(
  role: Role,
  userGroupIds: readonly string[],
  restriction: ZoneRestriction[] | null,
  need: ZoneAccessNeed,
): boolean {
  if (role === 'owner' || role === 'admin') return true;
  if (!restriction) return true;
  return restriction.some(
    (r) => userGroupIds.includes(r.groupId) && (need === 'contribute' || r.level === 'edit'),
  );
}

/**
 * Une restriction `edit` permet aux membres du groupe de modifier la zone même si
 * `plan_edit_min_role` est plus élevé que leur rôle (SPEC §5.3).
 */
export function zoneGrantsEdit(
  userGroupIds: readonly string[],
  restriction: ZoneRestriction[] | null,
): boolean {
  return restriction?.some((r) => r.level === 'edit' && userGroupIds.includes(r.groupId)) ?? false;
}
