import { and, eq, inArray, isNull } from 'drizzle-orm';
import { conflict, DomainError, forbidden, notFound, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { decorItem, decorPlacement, practice, practiceDeclaration } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { unlockFactsOf } from '../progression/unlock';
import { isUnlocked, type UnlockFacts } from '../progression/unlock.pure';

/*
 * Décoration (SPEC §4.2.6, §9.7) : objets posés sur le plan, sans effet sur les cultures ni sur les zones (DEC-01).
 * Placer, déplacer ou retirer exige `decor:place` ; un objet verrouillé pour l'auteur du geste donne `LOCKED_ITEM`
 * (DEC-02). Un objet ★ peut être déclaré comme pratique réelle du jardin (DEC-03).
 */

/** Catalogue avec l'état de déblocage pour un utilisateur (palette d'objets de l'éditeur). */
export async function decorCatalog(tx: Executor, facts: UnlockFacts) {
  const rows = await tx.select({ code: decorItem.code, spriteKey: decorItem.spriteKey, w: decorItem.widthTiles, h: decorItem.heightTiles, condition: decorItem.unlockCondition, practiceCode: practice.code })
    .from(decorItem).leftJoin(practice, eq(practice.id, decorItem.practiceId)).orderBy(decorItem.sortOrder).limit(500);
  return rows.map((r) => ({ ...r, unlocked: isUnlocked(r.condition, facts) }));
}

export type DecorCatalog = Awaited<ReturnType<typeof decorCatalog>>;

export async function decorCatalogFor(tx: Executor, userId: string) {
  return decorCatalog(tx, await unlockFactsOf(tx, userId));
}

/** Facts de déblocage lus une fois par lot de commandes. */
export type FactsLoader = () => Promise<UnlockFacts>;

function assertCanPlace(c: ScopedCtx) {
  if (!can(c.scope, 'decor:place')) throw forbidden();
}

export async function placeDecor(c: ScopedCtx, sceneZoneId: string | null, cmd: { itemCode: string; x: number; y: number; label: string | null }, facts: FactsLoader) {
  assertCanPlace(c);
  const [item] = await c.tx.select().from(decorItem).where(eq(decorItem.code, cmd.itemCode)).limit(1);
  if (!item) throw validation({ itemCode: ['unknownItem'] });
  // Revalidé au moment du geste, d'après la progression de l'utilisateur (DEC-02).
  if (!isUnlocked(item.unlockCondition, await facts())) throw new DomainError('LOCKED_ITEM', 'lockedItem', { items: [item.code] });
  const [row] = await c.tx.insert(decorPlacement).values({ gardenId: c.scope.gardenId, sceneZoneId, decorItemId: item.id, xCm: cmd.x, yCm: cmd.y, label: cmd.label, placedBy: c.actor.id })
    .returning({ id: decorPlacement.id });
  if (!row) throw notFound();
  await emit(c.tx, { type: 'decor.placed', subjectType: 'decor', subjectId: row.id, gardenId: c.scope.gardenId, actorId: c.actor.id, payload: { itemCode: item.code } }, c.clock.now());
  return row.id;
}

async function placementIn(c: ScopedCtx, id: string, sceneZoneId: string | null) {
  const [p] = await c.tx.select({ id: decorPlacement.id, itemCode: decorItem.code }).from(decorPlacement).innerJoin(decorItem, eq(decorItem.id, decorPlacement.decorItemId))
    .where(and(eq(decorPlacement.gardenId, c.scope.gardenId), eq(decorPlacement.id, id), sceneZoneId ? eq(decorPlacement.sceneZoneId, sceneZoneId) : isNull(decorPlacement.sceneZoneId))).limit(1);
  if (!p) throw notFound();
  return p;
}

export async function moveDecor(c: ScopedCtx, sceneZoneId: string | null, id: string, x: number, y: number) {
  assertCanPlace(c);
  const p = await placementIn(c, id, sceneZoneId);
  await c.tx.update(decorPlacement).set({ xCm: x, yCm: y }).where(eq(decorPlacement.id, p.id));
  await emit(c.tx, { type: 'decor.moved', subjectType: 'decor', subjectId: p.id, gardenId: c.scope.gardenId, actorId: c.actor.id, payload: { itemCode: p.itemCode } }, c.clock.now());
}

/** Retire l'objet ; la pratique déclarée par cet objet est retirée aussi si on le demande, sinon elle reste (détachée). */
export async function removeDecor(c: ScopedCtx, sceneZoneId: string | null, id: string, removePractice: boolean) {
  assertCanPlace(c);
  const p = await placementIn(c, id, sceneZoneId);
  if (removePractice) {
    const linked = await c.tx.select({ id: practiceDeclaration.id }).from(practiceDeclaration).where(and(eq(practiceDeclaration.gardenId, c.scope.gardenId), eq(practiceDeclaration.decorPlacementId, p.id)));
    // Les pratiques du jardin relèvent de `garden:update` (§5.2).
    if (linked.length && !can(c.scope, 'garden:update')) throw forbidden();
    if (linked.length) await c.tx.delete(practiceDeclaration).where(inArray(practiceDeclaration.id, linked.map((l) => l.id)));
  }
  await c.tx.delete(decorPlacement).where(eq(decorPlacement.id, p.id));
  await emit(c.tx, { type: 'decor.removed', subjectType: 'decor', subjectId: p.id, gardenId: c.scope.gardenId, actorId: c.actor.id, payload: { itemCode: p.itemCode } }, c.clock.now());
}

/**
 * DEC-03 : « déclarer comme pratique » un objet ★ (hôtel à insectes, nichoir, mare) crée la déclaration au niveau du
 * jardin, liée au placement. Comme toute pratique du jardin, cela exige `garden:update`.
 */
export async function declareDecorPractice(c: ScopedCtx, placementId: string) {
  if (c.scope.archived || !can(c.scope, 'garden:update')) throw forbidden();
  const [p] = await c.tx.select({ id: decorPlacement.id, practiceId: decorItem.practiceId }).from(decorPlacement).innerJoin(decorItem, eq(decorItem.id, decorPlacement.decorItemId))
    .where(and(eq(decorPlacement.gardenId, c.scope.gardenId), eq(decorPlacement.id, placementId))).limit(1);
  if (!p) throw notFound();
  if (!p.practiceId) throw validation({ placementId: ['notAPractice'] });
  const [existing] = await c.tx.select({ id: practiceDeclaration.id, decor: practiceDeclaration.decorPlacementId }).from(practiceDeclaration)
    .where(and(eq(practiceDeclaration.gardenId, c.scope.gardenId), eq(practiceDeclaration.practiceId, p.practiceId), isNull(practiceDeclaration.zoneId), isNull(practiceDeclaration.seasonId))).limit(1);
  if (existing?.decor === p.id) return { declarationId: existing.id };
  if (existing) throw conflict('practiceAlreadyDeclared');
  const [d] = await c.tx.insert(practiceDeclaration).values({ gardenId: c.scope.gardenId, practiceId: p.practiceId, decorPlacementId: p.id }).returning({ id: practiceDeclaration.id });
  await emit(c.tx, { type: 'garden.updated', subjectType: 'garden', subjectId: c.scope.gardenId, gardenId: c.scope.gardenId, actorId: c.actor.id, payload: { fields: ['practices'] } }, c.clock.now());
  return { declarationId: d?.id ?? '' };
}

/** Objets de la scène, pour l'instantané (§9.1). */
export async function sceneDecor(tx: Executor, gardenId: string, sceneZoneId: string | null) {
  const rows = await tx.select({
    id: decorPlacement.id, itemCode: decorItem.code, spriteKey: decorItem.spriteKey, w: decorItem.widthTiles, h: decorItem.heightTiles, x: decorPlacement.xCm, y: decorPlacement.yCm,
    label: decorPlacement.label, practiceCode: practice.code,
  }).from(decorPlacement).innerJoin(decorItem, eq(decorItem.id, decorPlacement.decorItemId)).leftJoin(practice, eq(practice.id, decorItem.practiceId))
    .where(and(eq(decorPlacement.gardenId, gardenId), sceneZoneId ? eq(decorPlacement.sceneZoneId, sceneZoneId) : isNull(decorPlacement.sceneZoneId))).orderBy(decorPlacement.yCm).limit(1000);
  const declared = rows.length ? new Set((await tx.select({ id: practiceDeclaration.decorPlacementId }).from(practiceDeclaration)
    .where(and(eq(practiceDeclaration.gardenId, gardenId), inArray(practiceDeclaration.decorPlacementId, rows.map((r) => r.id))))).map((r) => r.id)) : new Set<string | null>();
  return rows.map((r) => ({ ...r, practiceDeclared: declared.has(r.id) }));
}
