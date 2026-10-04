import { and, eq, isNull, sql } from 'drizzle-orm';
import { DomainError, forbidden, notFound, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can } from '@/server/authz/scope';
import { garden, terrainCell, zone } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { zoneCreateSchema } from '../zone/schema';
import { moveDecor, placeDecor, removeDecor, type FactsLoader } from '../decor/service';
import { unlockFactsOf } from '../progression/unlock';
import type { UnlockFacts } from '../progression/unlock.pure';
import { createZone, setZoneArchived, setZoneGeometry } from '../zone/service';
import { markPlanBatch, recordPlanSnapshot } from './history';
import { TMP_PREFIX, type ApplyPlanInput, type PlanCommand } from './plan.schema';
import { MAX_CELL_COORD, MAX_SCENE_CELLS, resampleCells, type Cell } from './terrain.pure';

/*
 * `applyPlanCommands` (SPEC §9.7) : un lot de commandes de l'éditeur, appliqué tout ou rien. Les commandes de zone
 * passent par les services de zone (permissions, restrictions de zone, RG-ZON-05, événements) ; le terrain peint et
 * l'échelle exigent `plan:edit`, la déco `decor:place` (les aménagements ponctuels, `plan:edit`). Une version de plan
 * différente de `baseVersion` donne `CONFLICT` sans rien appliquer. L'instantané du plan du jour est écrit à la fin du
 * lot, dans la même transaction (TLP-01).
 */

export type ApplyPlanResult = { planVersion: number; ids: Record<string, string> };

export async function applyPlanCommands(ctx: ScopedCtx, input: ApplyPlanInput): Promise<ApplyPlanResult> {
  const { scope } = ctx;
  if (scope.archived) throw forbidden();
  // Verrou de la ligne du jardin : deux enregistrements concurrents sont sérialisés et le second voit la nouvelle version.
  const [g] = await ctx.tx.select({ version: garden.planVersion }).from(garden).where(eq(garden.id, scope.gardenId)).for('update');
  if (!g) throw notFound();
  if (g.version !== input.baseVersion) throw new DomainError('CONFLICT', 'planVersionConflict');
  if (input.sceneZoneId) {
    const [host] = await ctx.tx.select({ hasInterior: zone.hasInterior }).from(zone).where(and(eq(zone.gardenId, scope.gardenId), eq(zone.id, input.sceneZoneId))).limit(1);
    if (!host?.hasInterior) throw validation({ sceneZoneId: ['notAnInterior'] });
  }
  // Point de sauvegarde : tout ou rien, même appelé dans une transaction plus large (PLN-04).
  return ctx.tx.transaction(async (sp) => {
    const c: ScopedCtx = { ...ctx, tx: sp };
    markPlanBatch(sp);
    const ids = new Map<string, string>();
    const resolve = (ref: string) => {
      if (!ref.startsWith(TMP_PREFIX)) return ref;
      const id = ids.get(ref);
      if (!id) throw validation({ commands: ['unknownReference'] });
      return id;
    };
    let facts: Promise<UnlockFacts> | null = null;
    const loadFacts: FactsLoader = () => (facts ??= unlockFactsOf(sp, ctx.actor.id));
    for (const cmd of input.commands) await applyOne(c, input.sceneZoneId, cmd, ids, resolve, loadFacts);
    const [v] = await sp.update(garden).set({ planVersion: sql`${garden.planVersion} + 1` }).where(eq(garden.id, scope.gardenId)).returning({ v: garden.planVersion });
    await recordPlanSnapshot(sp, scope.gardenId, ctx.clock.now());
    await emit(sp, { type: 'garden.plan_saved', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: ctx.actor.id, payload: { commands: input.commands.length, planVersion: v?.v ?? 0 } }, ctx.clock.now());
    return { planVersion: v?.v ?? input.baseVersion + 1, ids: Object.fromEntries(ids) };
  });
}

async function applyOne(c: ScopedCtx, sceneZoneId: string | null, cmd: PlanCommand, ids: Map<string, string>, resolve: (ref: string) => string, facts: FactsLoader) {
  const { tx, scope } = c;
  switch (cmd.op) {
    case 'createZone': {
      // Dans une scène intérieure, une zone dessinée sans parent appartient à la zone hôte (RG-ZON-05).
      const parentId = cmd.parentId ? resolve(cmd.parentId) : sceneZoneId;
      if (parentId) await assertInScene(c, parentId, sceneZoneId, true);
      const input = zoneCreateSchema.parse({ gardenId: scope.gardenId, name: cmd.name, parentId, zoneTypeId: cmd.zoneTypeId, geometry: cmd.geometry });
      const { zoneId } = await createZone(c, input);
      ids.set(cmd.clientId, zoneId);
      return;
    }
    case 'resizeZone':
    case 'moveZone': {
      const id = resolve(cmd.zoneId);
      await assertInScene(c, id, sceneZoneId, false);
      await setZoneGeometry(c, id, cmd.geometry);
      return;
    }
    case 'archiveZone': {
      const id = resolve(cmd.zoneId);
      await assertInScene(c, id, sceneZoneId, false);
      // La gomme archive, elle ne supprime jamais (RG-ZON-06, PLN-08).
      await setZoneArchived(c, id, true, { finishActiveCultures: cmd.finishActiveCultures });
      return;
    }
    case 'paintTerrain': {
      if (!can(scope, 'plan:edit')) throw forbidden();
      // Une case citée deux fois ne doit être écrite qu'une fois (`ON CONFLICT DO UPDATE` refuse le doublon).
      const unique = new Map(cmd.cells.map(([x, y]) => [`${x},${y}`, { gardenId: scope.gardenId, sceneZoneId, x, y, kind: cmd.kind }]));
      const rows = [...unique.values()];
      await tx.insert(terrainCell).values(rows).onConflictDoUpdate({ target: [terrainCell.gardenId, terrainCell.sceneZoneId, terrainCell.x, terrainCell.y], set: { kind: cmd.kind } });
      await assertCellBudget(c, sceneZoneId);
      return;
    }
    case 'eraseTerrain': {
      if (!can(scope, 'plan:edit')) throw forbidden();
      await tx.delete(terrainCell).where(and(eq(terrainCell.gardenId, scope.gardenId), sceneZoneId ? eq(terrainCell.sceneZoneId, sceneZoneId) : isNull(terrainCell.sceneZoneId),
        sql`(${terrainCell.x}, ${terrainCell.y}) in (${sql.join(cmd.cells.map(([x, y]) => sql`(${x}::int, ${y}::int)`), sql`, `)})`));
      return;
    }
    case 'setScale': {
      if (!can(scope, 'plan:edit')) throw forbidden();
      // L'échelle ne change que l'affichage : la géométrie reste en centimètres (PLN-07). Les cases de terrain, en
      // tuiles, sont rééchantillonnées pour que le dessin ne bouge pas (PNT-06).
      const [cur] = await tx.select({ tileSizeCm: garden.tileSizeCm }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
      await tx.update(garden).set({ tileSizeCm: cmd.tileSizeCm }).where(eq(garden.id, scope.gardenId));
      if (!cur || cur.tileSizeCm === cmd.tileSizeCm) return;
      const cells = await tx.select({ sceneZoneId: terrainCell.sceneZoneId, x: terrainCell.x, y: terrainCell.y, kind: terrainCell.kind }).from(terrainCell).where(eq(terrainCell.gardenId, scope.gardenId));
      if (!cells.length) return;
      const byScene = new Map<string | null, Cell[]>();
      for (const x of cells) byScene.set(x.sceneZoneId, [...(byScene.get(x.sceneZoneId) ?? []), { x: x.x, y: x.y, kind: x.kind }]);
      await tx.delete(terrainCell).where(eq(terrainCell.gardenId, scope.gardenId));
      const rows = [...byScene].flatMap(([scene, list]) => resampleCells(list, cur.tileSizeCm, cmd.tileSizeCm).filter((x) => x.x <= MAX_CELL_COORD && x.y <= MAX_CELL_COORD).map((x) => ({ gardenId: scope.gardenId, sceneZoneId: scene, ...x })));
      // Passer à une échelle plus fine multiplie les cases : chaque scène reste sous le plafond.
      if ([...byScene].some(([scene]) => rows.filter((r) => r.sceneZoneId === scene).length > MAX_SCENE_CELLS)) throw validation({ cells: ['tooManyCells'] });
      for (let i = 0; i < rows.length; i += 5000) await tx.insert(terrainCell).values(rows.slice(i, i + 5000));
      return;
    }
    case 'placeDecor':
      ids.set(cmd.clientId, await placeDecor(c, sceneZoneId, cmd, facts));
      return;
    case 'moveDecor':
      await moveDecor(c, sceneZoneId, resolve(cmd.decorId), cmd.x, cmd.y);
      return;
    case 'removeDecor':
      await removeDecor(c, sceneZoneId, resolve(cmd.decorId), cmd.removePractice);
      return;
  }
}

/** Plafond de cases peintes par scène (audit jardin vivant, M1), vérifié après l'écriture, dans le lot tout ou rien. */
async function assertCellBudget(c: ScopedCtx, sceneZoneId: string | null) {
  const [n] = await c.tx.select({ n: sql<number>`count(*)::int` }).from(terrainCell)
    .where(and(eq(terrainCell.gardenId, c.scope.gardenId), sceneZoneId ? eq(terrainCell.sceneZoneId, sceneZoneId) : isNull(terrainCell.sceneZoneId)));
  if ((n?.n ?? 0) > MAX_SCENE_CELLS) throw validation({ cells: ['tooManyCells'] });
}

/**
 * La zone appartient-elle à la scène éditée ? Pour un parent, on accepte aussi la zone hôte de la scène intérieure : ses
 * enfants sont dessinés dans cette scène.
 */
async function assertInScene(c: ScopedCtx, zoneId: string, sceneZoneId: string | null, asParent: boolean) {
  const [z] = await c.tx.select({ sceneZoneId: zone.sceneZoneId, hasInterior: zone.hasInterior }).from(zone)
    .where(and(eq(zone.gardenId, c.scope.gardenId), eq(zone.id, zoneId))).limit(1);
  if (!z) throw notFound();
  const childScene = z.hasInterior ? zoneId : z.sceneZoneId;
  const ok = asParent ? childScene === sceneZoneId : z.sceneZoneId === sceneZoneId;
  if (!ok) throw validation({ commands: ['wrongScene'] });
}
