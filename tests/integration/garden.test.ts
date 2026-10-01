import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createZone } from '../../src/features/zone/service';
import { deleteGarden, getGarden, listMyGardens, setArchived, updateGarden } from '../../src/features/garden/service';
import { zoneDetail } from '../../src/features/zone/service';
import { DomainError } from '../../src/lib/errors';
import { domainEvent, garden, gardenMember, season, zoneType } from '../../src/server/db/schema';
import { addMember, makeGarden } from './fixtures';
import { inTx, makeUser, recordingQueue, scopedCtx } from './helpers';

async function bedType(tx: Parameters<Parameters<typeof inTx>[0]>[0]) {
  const [t] = await tx.select().from(zoneType).where(eq(zoneType.code, 'bed')).limit(1);
  if (!t) throw new Error('type bed manquant');
  return t.id;
}

describe('jardins', () => {
  it('[GRD-01] création : owner, saison active, événement garden.created', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const [m] = await tx.select().from(gardenMember).where(eq(gardenMember.gardenId, gardenId));
      expect(m?.role).toBe('owner');
      const [s] = await tx.select().from(season).where(eq(season.gardenId, gardenId));
      expect(s).toMatchObject({ year: 2026, status: 'active', startsOn: '2026-01-01', endsOn: '2026-12-31' });
      const events = await tx.select({ type: domainEvent.type }).from(domainEvent).where(eq(domainEvent.gardenId, gardenId));
      expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['garden.created', 'member.joined']));
    }));

  it("[GRD-03] un membre ne voit que le geohash, pas la localisation précise", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'member');
      const asBob = await getGarden(tx, (await scopedCtx(tx, bob, gardenId)).scope);
      expect(asBob.location).toBeNull();
      expect(asBob.geohash4).toMatch(/^[0-9a-z]{4}$/);
      expect(JSON.stringify(asBob)).not.toContain('50.85');
      const asAlice = await getGarden(tx, (await scopedCtx(tx, alice, gardenId)).scope);
      expect(asAlice.location).toEqual({ lat: 50.85, lng: 4.35 });
    }));

  it('[GRD-04] le contexte modifié est pris en compte par les zones sans valeur propre', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const { zoneId } = await createZone(ctx, { gardenId, parentId: null, name: 'Planche', zoneTypeId: await bedType(tx), environment: null, geometry: null, hasInterior: false });
      await updateGarden(ctx, {
        gardenId, name: 'Les Tilleuls', orgType: 'family', environments: ['greenhouse', 'open_air'], lat: 50.85, lng: 4.35,
        timezone: 'Europe/Brussels', soilType: 'clay', soilPh: 6.5, koppen: 'Cfb', seasonStartMonth: 1, planEditMinRole: 'member',
      });
      const g = await getGarden(tx, ctx.scope);
      expect(g).toMatchObject({ soilType: 'clay', soilPh: 6.5, koppen: 'Cfb' });
      expect((await zoneDetail(tx, ctx.scope, zoneId)).effectiveEnvironment).toBe('greenhouse');
    }));

  it('[GRD-05] un jardin archivé est en lecture seule', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await setArchived(await scopedCtx(tx, alice, gardenId), true);
      const ctx = await scopedCtx(tx, alice, gardenId);
      expect(ctx.scope.archived).toBe(true);
      await expect(createZone(ctx, { gardenId, parentId: null, name: 'X', zoneTypeId: await bedType(tx), environment: null, geometry: null, hasInterior: false }))
        .rejects.toMatchObject({ code: 'FORBIDDEN', message: 'gardenArchived' });
    }));

  it('[GRD-06] suppression : nom à confirmer, membres prévenus, purge planifiée à J+30', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'member');
      const jobs = recordingQueue();
      const ctx = await scopedCtx(tx, alice, gardenId, { jobs });
      await expect(deleteGarden(ctx, 'mauvais nom')).rejects.toBeInstanceOf(DomainError);
      await deleteGarden(ctx, 'Les Tilleuls');
      const [g] = await tx.select().from(garden).where(eq(garden.id, gardenId));
      expect(g?.deletedAt).not.toBeNull();
      expect(g?.purgeAfter?.toISOString().slice(0, 10)).toBe('2026-07-15');
      expect(jobs.jobs.filter((j) => j.name === 'mail.send').map((j) => j.data.to).sort()).toEqual([alice.email, bob.email].sort());
      expect(await listMyGardens(tx, bob.id)).toEqual([]);
    }));

  it('[MBR-06] un utilisateur membre de trois jardins voit son rôle dans chacun', () =>
    inTx(async (tx) => {
      const piet = await makeUser(tx);
      const other = await makeUser(tx);
      const g1 = await makeGarden(tx, piet, { name: 'A' });
      const g2 = await makeGarden(tx, other, { name: 'B' });
      const g3 = await makeGarden(tx, other, { name: 'C' });
      await addMember(tx, g2, piet, 'admin');
      await addMember(tx, g3, piet, 'observer');
      const list = await listMyGardens(tx, piet.id);
      expect(list.map((g) => [g.name, g.role])).toEqual([['A', 'owner'], ['B', 'admin'], ['C', 'observer']]);
      const [row] = await tx.select().from(gardenMember).where(and(eq(gardenMember.gardenId, g1), eq(gardenMember.userId, piet.id)));
      expect(row?.role).toBe('owner');
    }));
});
