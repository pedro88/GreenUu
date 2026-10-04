import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { journalCreateSchema } from '../../src/features/journal/schema';
import { createJournalEntry } from '../../src/features/journal/service';
import { recordPlanSnapshot } from '../../src/features/scene/history';
import { applyPlanCommands } from '../../src/features/scene/plan';
import { applyPlanSchema } from '../../src/features/scene/plan.schema';
import { sceneSnapshot } from '../../src/features/scene/snapshot';
import { setZoneGeometry } from '../../src/features/zone/service';
import { decorItem, decorPlacement, garden, planSnapshot, terrainCell, terrainElement } from '../../src/server/db/schema';
import type { Tx } from '../../src/server/db/client';
import { addMember, makeGarden, makeZone } from './fixtures';
import { inTx, makeUser, NOW, scopedCtx } from './helpers';

/* Jardin vivant (SPEC §4.2.6, §9.5, §9.7, §12.10) : terrain peint, instantanés du plan, avatars qui rejouent leur action. */

const rect = (x: number, y: number, w: number, h: number) => ({ v: 1 as const, kind: 'rect' as const, x, y, w, h });
const version = async (tx: Tx, gardenId: string) => (await tx.select({ v: garden.planVersion }).from(garden).where(eq(garden.id, gardenId)))[0]?.v ?? -1;
const cellsOf = (tx: Tx, gardenId: string) => tx.select({ x: terrainCell.x, y: terrainCell.y, kind: terrainCell.kind }).from(terrainCell).where(eq(terrainCell.gardenId, gardenId));
const snapshotsOf = (tx: Tx, gardenId: string) => tx.select().from(planSnapshot).where(eq(planSnapshot.gardenId, gardenId));

describe('terrain peint', () => {
  it('[PNT-03] la conversion de la migration : rectangles en cases, ponctuels en objets posés, sans doublon au rejeu', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await tx.insert(terrainElement).values([
        // Allée de 3 m × 1 m à l'échelle de 50 cm : 6 × 2 cases à partir de la case (2, 4).
        { gardenId, kind: 'path', geometry: rect(100, 200, 300, 100) },
        // Une haie qui déborde d'une demi-case couvre la case entamée.
        { gardenId, kind: 'hedge', geometry: rect(0, 500, 125, 50) },
        { gardenId, kind: 'rain_barrel', geometry: rect(600, 100, 50, 50) },
      ]);
      await tx.execute(sql`select greenu_convert_terrain_elements()`);
      await tx.execute(sql`select greenu_convert_terrain_elements()`);
      const cells = await cellsOf(tx, gardenId);
      expect(cells.filter((c) => c.kind === 'path')).toHaveLength(12);
      expect(cells.filter((c) => c.kind === 'path').every((c) => c.x >= 2 && c.x <= 7 && c.y >= 4 && c.y <= 5)).toBe(true);
      expect(cells.filter((c) => c.kind === 'hedge').map((c) => c.x).sort()).toEqual([0, 1, 2]);
      const objects = await tx.select({ code: decorItem.code, x: decorPlacement.xCm, y: decorPlacement.yCm }).from(decorPlacement)
        .innerJoin(decorItem, eq(decorItem.id, decorPlacement.decorItemId)).where(eq(decorPlacement.gardenId, gardenId));
      // Au centre du rectangle : le pied de l'objet (bas de sa case) est une demi-case sous le centre.
      expect(objects).toEqual([{ code: 'rain_barrel', x: 625, y: 150 }]);
    }));

  it('[PNT-07] sans plan:edit, ni terrain ni aménagement ponctuel ; un lot de plus de 2 500 cases est refusé', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const david = await makeUser(tx);
      const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
      await makeZone(tx, bruno, gardenId, 'Potager', 'plot', null, rect(0, 0, 1000, 600));
      await addMember(tx, gardenId, david, 'member');
      await tx.update(garden).set({ planEditMinRole: 'admin' }).where(eq(garden.id, gardenId));
      const asDavid = await scopedCtx(tx, david, gardenId);
      const v = await version(tx, gardenId);
      await expect(applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'path', cells: [[0, 0]] }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'eraseTerrain', cells: [[0, 0]] }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'placeDecor', clientId: 'tmp:cuve', itemCode: 'rain_barrel', x: 50, y: 50, label: null }] }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
      // La déco reste permise (decor:place).
      const r = await applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'placeDecor', clientId: 'tmp:banc', itemCode: 'bench', x: 50, y: 50, label: null }] });
      expect(r.ids['tmp:banc']).toBeTruthy();
      // Un aménagement posé par l'admin ne peut pas être déplacé ni retiré par le membre.
      const asBruno = await scopedCtx(tx, bruno, gardenId);
      const placed = await applyPlanCommands(asBruno, { gardenId, sceneZoneId: null, baseVersion: r.planVersion, commands: [{ op: 'placeDecor', clientId: 'tmp:cuve', itemCode: 'rain_barrel', x: 150, y: 50, label: null }] });
      await expect(applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: placed.planVersion, commands: [{ op: 'removeDecor', decorId: placed.ids['tmp:cuve'] ?? '', removePractice: false }] }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
      const many = Array.from({ length: 2501 }, (_, i) => [i % 100, Math.floor(i / 100)]);
      expect(applyPlanSchema.safeParse({ gardenId, sceneZoneId: null, baseVersion: 0, commands: [{ op: 'paintTerrain', kind: 'path', cells: many }] }).success).toBe(false);
      expect(applyPlanSchema.safeParse({ gardenId, sceneZoneId: null, baseVersion: 0, commands: [{ op: 'paintTerrain', kind: 'path', cells: many.slice(0, 2500) }] }).success).toBe(true);
    }));

  it('[PNT-07] au plus 10 000 cases peintes par scène, y compris après un passage à une échelle plus fine (audit jardin vivant, M1)', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const block = (y0: number) => Array.from({ length: 2500 }, (_, i): [number, number] => [i % 100, y0 + Math.floor(i / 100)]);
      const v = (await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: await version(tx, gardenId), commands: [0, 25, 50, 75].map((y) => ({ op: 'paintTerrain' as const, kind: 'path' as const, cells: block(y) })) })).planVersion;
      expect(await cellsOf(tx, gardenId)).toHaveLength(10_000);
      // Repeindre une case existante reste possible ; une case de plus est refusée, et rien n'est écrit.
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'water', cells: [[0, 0]] }] });
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v + 1, commands: [{ op: 'paintTerrain', kind: 'path', cells: [[0, 100]] }] })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v + 1, commands: [{ op: 'setScale', tileSizeCm: 25 }] })).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await cellsOf(tx, gardenId)).toHaveLength(10_000);
    }));

  it('peindre, repeindre, gommer et changer d\'échelle : les cases suivent, l\'instantané de scène aussi', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      let v = await version(tx, gardenId);
      // Une case citée deux fois n'est écrite qu'une fois.
      v = (await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'path', cells: [[0, 0], [1, 0], [1, 0]] }] })).planVersion;
      v = (await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'water', cells: [[1, 0]] }, { op: 'eraseTerrain', cells: [[0, 0]] }] })).planVersion;
      expect(await cellsOf(tx, gardenId)).toEqual([{ x: 1, y: 0, kind: 'water' }]);
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'setScale', tileSizeCm: 25 }] });
      expect((await cellsOf(tx, gardenId)).map((c) => `${c.x},${c.y}`).sort()).toEqual(['2,0', '2,1', '3,0', '3,1']);
      const snap = await sceneSnapshot(tx, ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW });
      expect(snap.terrain).toHaveLength(4);
      expect(snap.tileSizeCm).toBe(25);
    }));
});

describe('instantanés du plan', () => {
  it('[TLP-01] un seul instantané par jour, à jour de la dernière version ; rien si la transaction échoue', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const zoneId = await makeZone(tx, alice, gardenId, 'Planche', 'bed', null, rect(0, 0, 200, 100));
      const ctx = await scopedCtx(tx, alice, gardenId);
      await tx.delete(planSnapshot).where(eq(planSnapshot.gardenId, gardenId));
      let v = await version(tx, gardenId);
      v = (await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'path', cells: [[0, 4]] }] })).planVersion;
      v = (await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'path', cells: [[1, 4]] }, { op: 'placeDecor', clientId: 'tmp:b', itemCode: 'bench', x: 300, y: 300, label: null }] })).planVersion;
      let rows = await snapshotsOf(tx, gardenId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.planVersion).toBe(v);
      expect(rows[0]?.payload.terrain).toEqual([{ sceneZoneId: null, kind: 'path', cells: [[0, 4], [1, 4]] }]);
      expect(rows[0]?.payload.objects.map((o) => o.itemCode)).toEqual(['bench']);
      // Une modification hors éditeur (géométrie depuis la fiche de la zone) met aussi à jour l'instantané du jour.
      await setZoneGeometry(ctx, zoneId, rect(0, 0, 300, 100));
      rows = await snapshotsOf(tx, gardenId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload.zones.find((z) => z.id === zoneId)?.geometry?.w).toBe(300);
      // Un lot refusé (seconde commande invalide) n'écrit rien, instantané compris.
      const before = rows[0]?.payload;
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'paintTerrain', kind: 'water', cells: [[5, 5]] }, { op: 'removeDecor', decorId: crypto.randomUUID(), removePractice: false }] }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect((await snapshotsOf(tx, gardenId))[0]?.payload).toEqual(before);
      // Le lendemain (jour local du jardin), une nouvelle ligne.
      await recordPlanSnapshot(tx, gardenId, new Date(NOW.getTime() + 24 * 3_600_000));
      expect(await snapshotsOf(tx, gardenId)).toHaveLength(2);
    }));
});

describe('avatars en action', () => {
  it('[LIV-08] [LIV-07] un arrosage enregistré il y a une heure : l\'avatar le rejoue, y compris seul dans un jardin personnel', () =>
    inTx(async (tx) => {
      const lucie = await makeUser(tx);
      const gardenId = await makeGarden(tx, lucie, { orgType: 'individual' });
      const planche = await makeZone(tx, lucie, gardenId, 'Planche 2', 'bed', null, rect(100, 100, 200, 300));
      // Lucie arrose maintenant ; on regarde la scène une heure plus tard.
      await createJournalEntry(await scopedCtx(tx, lucie, gardenId), journalCreateSchema.parse({ gardenId, zoneId: planche, kind: 'intervention', intervention: 'watering', attachmentIds: [] }));
      const snap = await sceneSnapshot(tx, (await scopedCtx(tx, lucie, gardenId)).scope, { userId: lucie.id, sceneZoneId: null, now: new Date(NOW.getTime() + 3_600_000) });
      expect(snap.avatars).toHaveLength(1);
      expect(snap.avatars[0]).toMatchObject({ userId: lucie.id, zoneId: planche, action: 'arroser', ageMinutes: 60, isViewer: true });
      // Au pied de la planche.
      expect(snap.avatars[0]?.position.y).toBe(400);
      // Deux jours plus tard : toujours affichée (utilisatrice courante), mais sans action rejouée.
      const later = await sceneSnapshot(tx, (await scopedCtx(tx, lucie, gardenId)).scope, { userId: lucie.id, sceneZoneId: null, now: new Date(NOW.getTime() + 48 * 3_600_000) });
      expect(later.avatars[0]).toMatchObject({ userId: lucie.id, action: null });
      // Pour un autre membre qui regarde, au-delà de 24 h, Lucie n'est plus là.
      const marc = await makeUser(tx);
      await addMember(tx, gardenId, marc, 'member');
      const seen = await sceneSnapshot(tx, (await scopedCtx(tx, marc, gardenId)).scope, { userId: marc.id, sceneZoneId: null, now: new Date(NOW.getTime() + 48 * 3_600_000) });
      expect(seen.avatars.filter((a) => a.userId === lucie.id)).toEqual([]);
    }));
});
