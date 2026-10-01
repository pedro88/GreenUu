import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { forbidden, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can, type Scope } from '@/server/authz/scope';
import { effectiveRestriction, zoneAllows, zoneGrantsEdit } from '@/server/authz/zone-access';
import type { Executor } from '@/server/db/client';
import { practice, practiceDeclaration, season } from '@/server/db/schema';
import * as zoneRepo from '../zone/repo';
import { effectivePractices, type PracticeDeclaration } from './effective';
import type { PracticeSetInput } from './schema';

export async function listPracticeCatalog(tx: Executor) {
  return tx.select().from(practice).orderBy(asc(practice.sortOrder));
}

/**
 * Remplace les déclarations permanentes d'un niveau (jardin ou zone).
 * Jardin : `garden:update`. Zone : mêmes droits que la modification de la zone.
 */
export async function setPractices(ctx: ScopedCtx, input: PracticeSetInput) {
  const { tx, scope } = ctx;
  if (input.zoneId === null) {
    if (!can(scope, 'garden:update')) throw forbidden();
    if (input.excluded.length > 0) throw validation({ excluded: ['excludeOnlyOnZone'] });
  } else {
    const z = await zoneRepo.findZone(tx, scope, input.zoneId);
    const chain = [...(z.path ? z.path.split('/') : []), z.id];
    const restriction = effectiveRestriction(await zoneRepo.restrictionChain(tx, scope, chain));
    const allowed = (can(scope, 'zone:update') || zoneGrantsEdit(scope.groupIds, restriction)) && zoneAllows(scope.role, scope.groupIds, restriction, 'edit');
    if (!allowed || scope.archived) throw forbidden();
  }
  const codes = [...new Set([...input.declared, ...input.excluded])];
  const rows = codes.length === 0 ? [] : await tx.select({ id: practice.id, code: practice.code }).from(practice).where(inArray(practice.code, codes));
  if (rows.length !== codes.length) throw validation({ declared: ['unknownPractice'] });
  const idOf = new Map(rows.map((r) => [r.code, r.id]));
  await tx.delete(practiceDeclaration).where(and(
    eq(practiceDeclaration.gardenId, scope.gardenId),
    input.zoneId === null ? isNull(practiceDeclaration.zoneId) : eq(practiceDeclaration.zoneId, input.zoneId),
    isNull(practiceDeclaration.seasonId),
  ));
  const values = [
    ...input.declared.map((code) => ({ code, excluded: false })),
    ...input.excluded.filter((c) => !input.declared.includes(c)).map((code) => ({ code, excluded: true })),
  ].map(({ code, excluded }) => ({ gardenId: scope.gardenId, zoneId: input.zoneId, practiceId: idOf.get(code) ?? '', excluded }));
  if (values.length > 0) await tx.insert(practiceDeclaration).values(values);
  return { count: values.length };
}

/** Déclarations brutes du jardin (avec l'année de saison quand elles sont bornées). */
export async function loadDeclarations(tx: Executor, scope: Scope): Promise<PracticeDeclaration[]> {
  const rows = await tx.select({
    code: practice.code, zoneId: practiceDeclaration.zoneId, year: season.year, excluded: practiceDeclaration.excluded,
  }).from(practiceDeclaration).innerJoin(practice, eq(practice.id, practiceDeclaration.practiceId))
    .leftJoin(season, eq(season.id, practiceDeclaration.seasonId))
    .where(eq(practiceDeclaration.gardenId, scope.gardenId));
  return rows.map((r) => ({ practiceCode: r.code, zoneId: r.zoneId, seasonYear: r.year, excluded: r.excluded }));
}

export async function practicesForZone(tx: Executor, scope: Scope, zoneChain: string[], seasonYear: number) {
  const decls = await loadDeclarations(tx, scope);
  const zoneId = zoneChain[zoneChain.length - 1] ?? null;
  return {
    effective: [...effectivePractices(decls, zoneChain, seasonYear)],
    ownDeclared: decls.filter((d) => d.zoneId === zoneId && !d.excluded && d.seasonYear === null).map((d) => d.practiceCode),
    ownExcluded: decls.filter((d) => d.zoneId === zoneId && d.excluded && d.seasonYear === null).map((d) => d.practiceCode),
  };
}
