import { and, eq, sql } from 'drizzle-orm';
import { DomainError, forbidden, notFound, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can } from '@/server/authz/scope';
import { garden, terrainElement, zone } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { zoneCreateSchema } from '../zone/schema';
import { createZone, setZoneArchived, setZoneGeometry } from '../zone/service';
import { TMP_PREFIX, type ApplyPlanInput, type PlanCommand } from './plan.schema';

/*
 * `applyPlanCommands` (SPEC §9.7) : un lot de commandes de l'éditeur, appliqué tout ou rien. Les commandes de zone
 * passent par les services de zone (permissions, restrictions de zone, RG-ZON-05, événements) ; le terrain et l'échelle
 * exigent `plan:edit`. Une version de plan différente de `baseVersion` donne `CONFLICT` sans rien appliquer.
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
    const ids = new Map<string, string>();
    const resolve = (ref: string) => {
      if (!ref.startsWith(TMP_PREFIX)) return ref;
      const id = ids.get(ref);
      if (!id) throw validation({ commands: ['unknownReference'] });
      return id;
    };
    for (const cmd of input.commands) await applyOne(c, input.sceneZoneId, cmd, ids, resolve);
    const [v] = await sp.update(garden).set({ planVersion: sql`${garden.planVersion} + 1` }).where(eq(garden.id, scope.gardenId)).returning({ v: garden.planVersion });
    await emit(sp, { type: 'garden.plan_saved', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: ctx.actor.id, payload: { commands: input.commands.length, planVersion: v?.v ?? 0 } }, ctx.clock.now());
    return { planVersion: v?.v ?? input.baseVersion + 1, ids: Object.fromEntries(ids) };
  });
}

async function applyOne(c: ScopedCtx, sceneZoneId: string | null, cmd: PlanCommand, ids: Map<string, string>, resolve: (ref: string) => string) {
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
    case 'addTerrain': {
      if (!can(scope, 'plan:edit')) throw forbidden();
      const [t] = await tx.insert(terrainElement).values({ gardenId: scope.gardenId, sceneZoneId, kind: cmd.kind, geometry: cmd.geometry }).returning({ id: terrainElement.id });
      if (t) ids.set(cmd.clientId, t.id);
      return;
    }
    case 'removeTerrain': {
      if (!can(scope, 'plan:edit')) throw forbidden();
      const id = resolve(cmd.terrainId);
      const gone = await tx.delete(terrainElement).where(and(eq(terrainElement.gardenId, scope.gardenId), eq(terrainElement.id, id))).returning({ id: terrainElement.id });
      if (!gone.length) throw notFound();
      return;
    }
    case 'setScale': {
      if (!can(scope, 'plan:edit')) throw forbidden();
      // L'échelle ne change que l'affichage : la géométrie reste en centimètres (PLN-07).
      await tx.update(garden).set({ tileSizeCm: cmd.tileSizeCm }).where(eq(garden.id, scope.gardenId));
      return;
    }
  }
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
