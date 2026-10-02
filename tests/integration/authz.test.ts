import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import '../../src/features/account/actions';
import '../../src/features/garden/actions';
import '../../src/features/group/actions';
import '../../src/features/member/actions';
import '../../src/features/practice/actions';
import '../../src/features/zone/actions';
import '../../src/features/culture/actions';
import '../../src/features/journal/actions';
import '../../src/features/harvest/actions';
import '../../src/features/plant/actions';
import '../../src/features/ticket/actions';
import '../../src/features/notification/actions';
import { actionRegistry, runAction, type ActionDeps } from '../../src/server/action-core';
import { loadScope } from '../../src/server/authz/scope';
import type { Tx } from '../../src/server/db/client';
import { garden, zone, zoneType } from '../../src/server/db/schema';
import { createZone, updateZone } from '../../src/features/zone/service';
import { invite } from '../../src/features/member/service';
import { createGroup } from '../../src/features/group/service';
import { fixedClock } from '../../src/server/clock';
import { addMember, makeGarden, makeGroup } from './fixtures';
import { inTx, makeUser, NOW, recordingQueue, scopedCtx } from './helpers';

const deps = (tx: Tx): ActionDeps => ({ db: tx, clock: fixedClock(NOW), appUrl: 'http://localhost:3000', jobs: () => recordingQueue() });

/** Une entrée valide (au sens Zod) par action liée à un jardin. Toute nouvelle action doit en avoir une. */
function samples(gardenId: string): Record<string, Record<string, unknown>> {
  const id = randomUUID();
  return {
    'garden.update': { gardenId, name: 'X Y', orgType: 'family', environments: ['open_air'], lat: 1, lng: 1, timezone: 'Europe/Paris', seasonStartMonth: 1, planEditMinRole: 'admin' },
    'garden.archive': { gardenId },
    'garden.unarchive': { gardenId },
    'garden.delete': { gardenId, confirmName: 'x' },
    'garden.transfer': { gardenId, toMemberId: id },
    'zone.create': { gardenId, name: 'Z', zoneTypeId: id },
    'zone.update': { gardenId, zoneId: id, name: 'Z', zoneTypeId: id },
    'zone.move': { gardenId, zoneId: id, parentId: null },
    'zone.archive': { gardenId, zoneId: id },
    'zone.unarchive': { gardenId, zoneId: id },
    'zoneType.create': { gardenId, label: 'Butte' },
    'zoneType.archive': { gardenId, zoneTypeId: id },
    'zone.restrict': { gardenId, zoneId: id, restrictions: [] },
    'member.invite': { gardenId, email: 'a@b.fr', role: 'member' },
    'member.revokeInvitation': { gardenId, invitationId: id },
    'member.changeRole': { gardenId, memberId: id, role: 'member' },
    'member.remove': { gardenId, memberId: id },
    'member.leave': { gardenId },
    'group.create': { gardenId, name: 'Groupe' },
    'group.update': { gardenId, groupId: id, name: 'Groupe' },
    'group.archive': { gardenId, groupId: id },
    'practice.set': { gardenId, zoneId: null, declared: [] },
    'culture.preview': { gardenId, zoneId: id, speciesId: id, method: 'direct_sowing', anchorDate: '2026-04-01' },
    'culture.create': { gardenId, zoneId: id, speciesId: id, method: 'direct_sowing', anchorDate: '2026-04-01' },
    'culture.recordStage': { gardenId, cultureId: id, stage: 'sowing', actualOn: '2026-04-01' },
    'culture.update': { gardenId, cultureId: id, varietyId: null },
    'culture.outcome': { gardenId, cultureId: id, outcome: 'failed' },
    'culture.delete': { gardenId, cultureId: id },
    'culture.restore': { gardenId, cultureId: id },
    'season.setClosed': { gardenId, year: 2026, closed: true },
    'journal.create': { gardenId, zoneId: id, kind: 'note', body: 'x' },
    'journal.delete': { gardenId, entryId: id },
    'journal.resolve': { gardenId, entryId: id },
    'harvest.record': { gardenId, cultureId: id, quantity: 1, unit: 'kg' },
    'harvest.delete': { gardenId, harvestId: id },
    'plant.gardenVarieties': { gardenId, speciesId: id },
    'ticket.create': { gardenId, type: 'task', title: 'Arroser' },
    'ticket.update': { gardenId, ticketId: id, type: 'task', title: 'Arroser' },
    'ticket.transition': { gardenId, ticketId: id, status: 'done' },
    'ticket.assign': { gardenId, ticketId: id, memberIds: [], groupIds: [] },
    'ticket.delete': { gardenId, ticketId: id },
    'ticket.stopSeries': { gardenId, seriesId: id },
    'ticket.toggleChecklist': { gardenId, itemId: id, done: true },
    'ticket.addChecklist': { gardenId, ticketId: id, label: 'x' },
    'ticket.comment': { gardenId, ticketId: id, body: 'x' },
  };
}

async function plotType(tx: Tx) {
  const [t] = await tx.select().from(zoneType).where(eq(zoneType.code, 'plot'));
  if (!t) throw new Error('plot');
  return t.id;
}

describe('autorisation centralisée', () => {
  it('[AUTHZ-02] chaque action liée à un jardin refuse un non-membre (FORBIDDEN, aucune écriture)', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const hugo = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const bound = [...actionRegistry.values()].filter((d) => d.permission !== undefined);
      expect(bound.length).toBeGreaterThan(15);
      const inputs = samples(gardenId);
      for (const def of bound) {
        const input = inputs[def.name];
        expect(input, `entrée d'exemple manquante pour ${def.name}`).toBeDefined();
        const res = await runAction(def, hugo, input, deps(tx));
        expect(res.ok ? `${def.name}: ok` : `${def.name}: ${res.error.code}`).toBe(`${def.name}: FORBIDDEN`);
      }
      const [g] = await tx.select().from(garden).where(eq(garden.id, gardenId));
      expect(g?.name).toBe('Les Tilleuls');
      expect(g?.deletedAt).toBeNull();
    }));

  it("[AUTHZ-03] un ID de zone d'un autre jardin dont on est membre donne NOT_FOUND", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const g1 = await makeGarden(tx, alice, { name: 'J1' });
      const g2 = await makeGarden(tx, alice, { name: 'J2' });
      const plot = await plotType(tx);
      const { zoneId } = await createZone(await scopedCtx(tx, alice, g2), { gardenId: g2, parentId: null, name: 'Chez J2', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false });
      await expect(updateZone(await scopedCtx(tx, alice, g1), { gardenId: g1, zoneId, name: 'Piratée', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      const [row] = await tx.select().from(zone).where(eq(zone.id, zoneId));
      expect(row?.name).toBe('Chez J2');
    }));

  it('[AUTHZ-05] zone restreinte : un membre hors groupe ne peut pas y créer de sous-zone', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'member');
      const groupId = await makeGroup(tx, gardenId, 'Famille Dupont', []);
      const asAlice = await scopedCtx(tx, alice, gardenId);
      const plot = await plotType(tx);
      const { zoneId } = await createZone(asAlice, { gardenId, parentId: null, name: 'Parcelle Dupont', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false });
      const { setZoneRestrictions } = await import('../../src/features/zone/service');
      await setZoneRestrictions(asAlice, zoneId, [{ groupId, level: 'edit' }]);
      await expect(createZone(await scopedCtx(tx, bob, gardenId), { gardenId, parentId: zoneId, name: 'Intrus', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it("[AUTHZ-06] un membre d'un groupe « edit » peut créer une sous-zone (restriction héritée)", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice, { orgType: 'collective' });
      const bobId = await addMember(tx, gardenId, bob, 'member');
      const groupId = await makeGroup(tx, gardenId, 'Famille Dupont', [bobId]);
      const asAlice = await scopedCtx(tx, alice, gardenId);
      const plot = await plotType(tx);
      const parcelle = await createZone(asAlice, { gardenId, parentId: null, name: 'Parcelle Dupont', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false });
      const sous = await createZone(asAlice, { gardenId, parentId: parcelle.zoneId, name: 'Planche', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false });
      const { setZoneRestrictions } = await import('../../src/features/zone/service');
      await setZoneRestrictions(asAlice, parcelle.zoneId, [{ groupId, level: 'edit' }]);
      // Jardin collectif : un membre ne peut pas modifier les zones… sauf via sa restriction « edit ».
      const created = await createZone(await scopedCtx(tx, bob, gardenId), { gardenId, parentId: sous.zoneId, name: 'Rang', zoneTypeId: plot, environment: null, geometry: null, hasInterior: false });
      expect(created.zoneId).toBeTruthy();
    }));

  it("[AUTHZ-07] un observateur ne peut ni créer de zone, ni inviter, ni gérer les groupes", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const farid = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, farid, 'observer');
      const ctx = await scopedCtx(tx, farid, gardenId);
      await expect(createZone(ctx, { gardenId, parentId: null, name: 'Z', zoneTypeId: await plotType(tx), environment: null, geometry: null, hasInterior: false })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(invite(ctx, { gardenId, email: 'z@test.local', role: 'member', groupIds: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(createGroup(ctx, { name: 'G', color: 'green', memberIds: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it("[AUTHZ-09] un modérateur plateforme non membre n'a aucun accès au jardin", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const modo = { ...(await makeUser(tx)), platformRole: 'moderator' as const };
      const gardenId = await makeGarden(tx, alice);
      expect(await loadScope(tx, modo.id, gardenId)).toBeNull();
      const def = actionRegistry.get('garden.update');
      if (!def) throw new Error('garden.update');
      const res = await runAction(def, modo, samples(gardenId)['garden.update'], deps(tx));
      expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }));

  it("[AUTHZ-10] jardin collectif : un membre ne crée pas de zone, un admin si", () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const chloe = await makeUser(tx);
      const david = await makeUser(tx);
      const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
      await addMember(tx, gardenId, chloe, 'admin');
      await addMember(tx, gardenId, david, 'member');
      const input = { gardenId, parentId: null, name: 'Z', zoneTypeId: await plotType(tx), environment: null, geometry: null, hasInterior: false };
      await expect(createZone(await scopedCtx(tx, david, gardenId), input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(createZone(await scopedCtx(tx, chloe, gardenId), input)).resolves.toMatchObject({ zoneId: expect.any(String) });
    }));

  it("[AUTH-03] créer un jardin exige un e-mail vérifié", () =>
    inTx(async (tx) => {
      const unverified = await makeUser(tx, { verified: false });
      const def = actionRegistry.get('garden.create');
      if (!def) throw new Error('garden.create');
      const res = await runAction(def, unverified, { name: 'Potager', orgType: 'family', environments: ['open_air'], lat: 1, lng: 1, timezone: 'Europe/Paris' }, deps(tx));
      expect(res).toEqual({ ok: false, error: { code: 'FORBIDDEN', message: 'emailNotVerified' } });
    }));

  it('validation Zod avant tout : erreurs de champ typées', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const def = actionRegistry.get('garden.create');
      if (!def) throw new Error('garden.create');
      const res = await runAction(def, alice, { name: 'P', orgType: 'family', environments: [], lat: 'x', lng: 1, timezone: 'Mars/Olympus' }, deps(tx));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(Object.keys(res.error.fieldErrors ?? {}).sort()).toEqual(['environments', 'lat', 'name', 'timezone']);
      expect(await runAction(def, null, {}, deps(tx))).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }));

});
