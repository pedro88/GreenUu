import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createZone, createZoneType, moveZone, setZoneArchived, zoneTree } from '../../src/features/zone/service';
import { zoneTypeOptions } from '../../src/features/zone/queries';
import type { Tx } from '../../src/server/db/client';
import { zone, zoneType } from '../../src/server/db/schema';
import { makeGarden } from './fixtures';
import { inTx, makeUser, scopedCtx } from './helpers';

async function typeId(tx: Tx, code: string) {
  const [t] = await tx.select().from(zoneType).where(eq(zoneType.code, code)).limit(1);
  if (!t) throw new Error(code);
  return t.id;
}

const z = (gardenId: string, name: string, zoneTypeId: string, parentId: string | null = null, geometry: { v: 1; kind: 'rect'; x: number; y: number; w: number; h: number } | null = null) =>
  ({ gardenId, parentId, name, zoneTypeId, environment: null, geometry, hasInterior: false });

describe('zones', () => {
  it('[ZON-01] arbre à trois niveaux avec profondeur et chemin', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const potager = await createZone(ctx, z(gardenId, 'Potager', await typeId(tx, 'plot')));
      const planche = await createZone(ctx, z(gardenId, 'Planche 1', await typeId(tx, 'bed'), potager.zoneId));
      const rang = await createZone(ctx, z(gardenId, 'Rang A', await typeId(tx, 'row'), planche.zoneId));
      const [row] = await tx.select().from(zone).where(eq(zone.id, rang.zoneId));
      expect(row).toMatchObject({ depth: 2, path: `${potager.zoneId}/${planche.zoneId}` });
      const tree = await zoneTree(tx, ctx.scope, { includeArchived: false });
      expect(tree[0]?.name).toBe('Potager');
      expect(tree[0]?.children[0]?.children[0]?.name).toBe('Rang A');
    }));

  it('[ZON-02] déplacer une zone sous son descendant est refusé', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const a = await createZone(ctx, z(gardenId, 'A', await typeId(tx, 'plot')));
      const b = await createZone(ctx, z(gardenId, 'B', await typeId(tx, 'bed'), a.zoneId));
      await expect(moveZone(ctx, { zoneId: a.zoneId, parentId: b.zoneId })).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { parentId: ['cycle'] } });
    }));

  it('[ZON-02] déplacer une zone réécrit les chemins de son sous-arbre', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const plot = await typeId(tx, 'plot');
      const a = await createZone(ctx, z(gardenId, 'A', plot));
      const b = await createZone(ctx, z(gardenId, 'B', plot, a.zoneId));
      const c = await createZone(ctx, z(gardenId, 'C', plot, b.zoneId));
      const other = await createZone(ctx, z(gardenId, 'Autre', plot));
      await moveZone(ctx, { zoneId: b.zoneId, parentId: other.zoneId });
      const [cRow] = await tx.select().from(zone).where(eq(zone.id, c.zoneId));
      expect(cRow).toMatchObject({ path: `${other.zoneId}/${b.zoneId}`, depth: 2 });
    }));

  it('[ZON-03] une zone de profondeur 8 ne peut pas recevoir d\'enfant', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const plot = await typeId(tx, 'plot');
      let parent: string | null = null;
      for (let i = 0; i < 8; i++) parent = (await createZone(ctx, z(gardenId, `N${i}`, plot, parent))).zoneId;
      await expect(createZone(ctx, z(gardenId, 'Trop profond', plot, parent))).rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { parentId: ['maxDepth'] } });
    }));

  it("[ZON-04] une zone d'un autre jardin ne peut pas servir de parent (service et base)", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const g1 = await makeGarden(tx, alice, { name: 'G1' });
      const g2 = await makeGarden(tx, alice, { name: 'G2' });
      const plot = await typeId(tx, 'plot');
      const foreign = await createZone(await scopedCtx(tx, alice, g2), z(g2, 'Ailleurs', plot));
      await expect(createZone(await scopedCtx(tx, alice, g1), z(g1, 'Ici', plot, foreign.zoneId))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(tx.transaction((sp) => sp.insert(zone).values({ gardenId: g1, parentId: foreign.zoneId, zoneTypeId: plot, name: 'Direct' })))
        .rejects.toThrow();
    }));

  it('[ZON-07] un type personnalisé n\'est proposé que dans son jardin', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const g1 = await makeGarden(tx, alice, { name: 'G1' });
      const g2 = await makeGarden(tx, alice, { name: 'G2' });
      const c1 = await scopedCtx(tx, alice, g1);
      await createZoneType(c1, { label: 'Butte lasagne', canHostCultures: true, hasInteriorDefault: false });
      expect((await zoneTypeOptions(tx, c1.scope)).some((t) => t.label === 'Butte lasagne')).toBe(true);
      expect((await zoneTypeOptions(tx, (await scopedCtx(tx, alice, g2)).scope)).some((t) => t.label === 'Butte lasagne')).toBe(false);
    }));

  it('[ZON-08] archiver une zone archive son sous-arbre ; elles restent consultables', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const plot = await typeId(tx, 'plot');
      const a = await createZone(ctx, z(gardenId, 'A', plot));
      await createZone(ctx, z(gardenId, 'A1', plot, a.zoneId));
      const { zoneIds } = await setZoneArchived(ctx, a.zoneId, true);
      expect(zoneIds).toHaveLength(2);
      expect(await zoneTree(tx, ctx.scope, { includeArchived: false })).toEqual([]);
      const withArchived = await zoneTree(tx, ctx.scope, { includeArchived: true });
      expect(withArchived[0]?.archived).toBe(true);
      expect(withArchived[0]?.children[0]?.archived).toBe(true);
    }));

  it('[ZON-11] deux zones sœurs dessinées ne peuvent pas se chevaucher', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const bed = await typeId(tx, 'bed');
      await createZone(ctx, z(gardenId, 'P1', bed, null, { v: 1, kind: 'rect', x: 0, y: 0, w: 200, h: 100 }));
      await expect(createZone(ctx, z(gardenId, 'P2', bed, null, { v: 1, kind: 'rect', x: 150, y: 50, w: 200, h: 100 })))
        .rejects.toMatchObject({ fieldErrors: { geometry: ['overlaps_sibling'] } });
    }));
});
