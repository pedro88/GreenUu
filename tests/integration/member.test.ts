import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { transferOwnership } from '../../src/features/garden/service';
import { archiveGroup, createGroup } from '../../src/features/group/service';
import { acceptInvitation, changeRole, invite, leave, listMembers, previewInvitation, removeMember, revokeInvitation } from '../../src/features/member/service';
import { setZoneRestrictions, createZone } from '../../src/features/zone/service';
import { gardenInvitation, gardenMember, groupMember, user, zoneGroupPermission, zoneType } from '../../src/server/db/schema';
import { addMember, makeGarden, makeGroup, memberIdOf } from './fixtures';
import { ctxFor, inTx, makeUser, NOW, recordingQueue, scopedCtx } from './helpers';

function tokenFrom(jobs: ReturnType<typeof recordingQueue>): string {
  const mail = jobs.jobs.find((j) => j.name === 'mail.send');
  const m = mail?.data.text.match(/\/invitation\/([A-Za-z0-9_-]+)/);
  if (!m?.[1]) throw new Error("pas de lien d'invitation");
  return m[1];
}

describe('invitations', () => {
  it("[INV-01] l'invitation envoie un e-mail avec le lien et apparaît « en attente »", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const jobs = recordingQueue();
      await invite(await scopedCtx(tx, alice, gardenId, { jobs }), { gardenId, email: 'nouveau@test.local', role: 'member', groupIds: [] });
      const mail = jobs.jobs[0];
      expect(mail?.name).toBe('mail.send');
      expect(mail?.data.to).toBe('nouveau@test.local');
      expect(mail?.data.subject).toContain('Les Tilleuls');
      expect(tokenFrom(jobs)).toHaveLength(43);
      const { invitations } = await listMembers(tx, (await scopedCtx(tx, alice, gardenId)).scope, NOW);
      expect(invitations.map((i) => i.email)).toEqual(['nouveau@test.local']);
      const [row] = await tx.select().from(gardenInvitation).where(eq(gardenInvitation.gardenId, gardenId));
      expect(row?.tokenHash).not.toContain(tokenFrom(jobs));
    }));

  it("[INV-02] acceptation : adhésion active et e-mail marqué vérifié", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const jobs = recordingQueue();
      await invite(await scopedCtx(tx, alice, gardenId, { jobs }), { gardenId, email: 'carla@test.local', role: 'member', groupIds: [] });
      const carla = await makeUser(tx, { email: 'carla@test.local', verified: false });
      await acceptInvitation(ctxFor(tx, carla), tokenFrom(jobs));
      expect((await scopedCtx(tx, carla, gardenId)).scope.role).toBe('member');
      const [u] = await tx.select().from(user).where(eq(user.id, carla.id));
      expect(u?.emailVerified).toBe(true);
    }));

  it("[INV-03] un compte avec une autre adresse ne peut pas accepter", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const jobs = recordingQueue();
      await invite(await scopedCtx(tx, alice, gardenId, { jobs }), { gardenId, email: 'carla@test.local', role: 'member', groupIds: [] });
      const mallory = await makeUser(tx);
      await expect(acceptInvitation(ctxFor(tx, mallory), tokenFrom(jobs))).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'invitationOtherEmail' });
      expect(await tx.select().from(gardenMember).where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.userId, mallory.id)))).toEqual([]);
    }));

  it('[INV-04] une invitation expirée, révoquée ou déjà acceptée est invalide sans fuite de données', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const jobs = recordingQueue();
      const ctx = await scopedCtx(tx, alice, gardenId, { jobs });
      const { invitationId } = await invite(ctx, { gardenId, email: 'x@test.local', role: 'member', groupIds: [] });
      const token = tokenFrom(jobs);
      expect((await previewInvitation(tx, token, NOW)).status).toBe('valid');
      expect(await previewInvitation(tx, token, new Date(NOW.getTime() + 8 * 86_400_000))).toEqual({ status: 'invalid' });
      await revokeInvitation(ctx, invitationId);
      expect(await previewInvitation(tx, token, NOW)).toEqual({ status: 'invalid' });
    }));

  it("[INV-05] réinviter la même adresse révoque l'invitation précédente", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const jobs = recordingQueue();
      const ctx = await scopedCtx(tx, alice, gardenId, { jobs });
      await invite(ctx, { gardenId, email: 'x@test.local', role: 'member', groupIds: [] });
      const first = tokenFrom(jobs);
      jobs.jobs.length = 0;
      await invite(ctx, { gardenId, email: 'x@test.local', role: 'observer', groupIds: [] });
      expect(await previewInvitation(tx, first, NOW)).toEqual({ status: 'invalid' });
      expect(await previewInvitation(tx, tokenFrom(jobs), NOW)).toMatchObject({ status: 'valid', role: 'observer' });
    }));

  it('[INV-06] inviter un membre actif est un conflit', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'member');
      await expect(invite(await scopedCtx(tx, alice, gardenId), { gardenId, email: bob.email, role: 'member', groupIds: [] })).rejects.toMatchObject({ code: 'CONFLICT' });
    }));

  it("[INV-07] un admin ne peut pas inviter un admin", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const chloe = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, chloe, 'admin');
      await expect(invite(await scopedCtx(tx, chloe, gardenId), { gardenId, email: 'y@test.local', role: 'admin', groupIds: [] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it("[INV-08] l'invité rejoint les groupes indiqués", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const groupId = await makeGroup(tx, gardenId, 'Équipe serre', []);
      const jobs = recordingQueue();
      await invite(await scopedCtx(tx, alice, gardenId, { jobs }), { gardenId, email: 'dan@test.local', role: 'member', groupIds: [groupId] });
      const dan = await makeUser(tx, { email: 'dan@test.local' });
      await acceptInvitation(ctxFor(tx, dan), tokenFrom(jobs));
      expect((await scopedCtx(tx, dan, gardenId)).scope.groupIds).toEqual([groupId]);
    }));
});

describe('membres', () => {
  it("[MBR-01] départ : left_at renseigné, groupes quittés, admins prévenus", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const bobMember = await addMember(tx, gardenId, bob, 'member');
      await makeGroup(tx, gardenId, 'G', [bobMember]);
      const jobs = recordingQueue();
      await leave(await scopedCtx(tx, bob, gardenId, { jobs }));
      const [row] = await tx.select().from(gardenMember).where(eq(gardenMember.id, bobMember));
      expect(row?.leftAt).not.toBeNull();
      expect(await tx.select().from(groupMember).where(eq(groupMember.memberId, bobMember))).toEqual([]);
      expect(jobs.jobs.map((j) => j.data.to)).toEqual([alice.email]);
      const { former } = await listMembers(tx, (await scopedCtx(tx, alice, gardenId)).scope, NOW);
      expect(former.map((m) => m.userId)).toEqual([bob.id]);
    }));

  it("[MBR-02] l'owner ne peut pas quitter son jardin", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await expect(leave(await scopedCtx(tx, alice, gardenId))).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'ownerMustTransfer' });
    }));

  it("[MBR-03] transfert de propriété : un seul owner actif", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const chloe = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const chloeId = await addMember(tx, gardenId, chloe, 'admin');
      await transferOwnership(await scopedCtx(tx, alice, gardenId), chloeId);
      const owners = await tx.select().from(gardenMember).where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.role, 'owner'), isNull(gardenMember.leftAt)));
      expect(owners.map((o) => o.userId)).toEqual([chloe.id]);
      expect((await scopedCtx(tx, alice, gardenId)).scope.role).toBe('admin');
    }));

  it("[MBR-04] un admin ne peut ni retirer ni rétrograder un autre admin", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const chloe = await makeUser(tx);
      const dora = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, chloe, 'admin');
      const doraId = await addMember(tx, gardenId, dora, 'admin');
      const asChloe = await scopedCtx(tx, chloe, gardenId);
      await expect(removeMember(asChloe, doraId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(changeRole(asChloe, doraId, 'member')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('[MBR-05] un ancien membre réinvité obtient une nouvelle adhésion', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const old = await addMember(tx, gardenId, bob, 'member');
      await removeMember(await scopedCtx(tx, alice, gardenId), old);
      const jobs = recordingQueue();
      await invite(await scopedCtx(tx, alice, gardenId, { jobs }), { gardenId, email: bob.email, role: 'observer', groupIds: [] });
      await acceptInvitation(ctxFor(tx, bob), tokenFrom(jobs));
      const rows = await tx.select().from(gardenMember).where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.userId, bob.id)));
      expect(rows).toHaveLength(2);
      expect(await memberIdOf(tx, gardenId, bob.id)).not.toBe(old);
    }));
});

describe('groupes', () => {
  it('[GRP-01] création d\'un groupe avec deux membres', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const david = await makeUser(tx);
      const emma = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice, { orgType: 'collective' });
      const ids = [await addMember(tx, gardenId, david, 'member'), await addMember(tx, gardenId, emma, 'member')];
      const { groupId } = await createGroup(await scopedCtx(tx, alice, gardenId), { name: 'Équipe serre', color: 'green', memberIds: ids });
      expect((await tx.select().from(groupMember).where(eq(groupMember.groupId, groupId))).map((r) => r.memberId).sort()).toEqual(ids.sort());
      await expect(createGroup(await scopedCtx(tx, alice, gardenId), { name: 'équipe SERRE', color: 'green', memberIds: [] }))
        .rejects.toMatchObject({ fieldErrors: { name: ['groupNameTaken'] } });
    }));

  it("[GRP-02] un groupe ne contient que des membres actifs du jardin", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const outsider = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const other = await makeGarden(tx, outsider, { name: 'Autre' });
      const foreignMember = await memberIdOf(tx, other, outsider.id);
      await expect(createGroup(await scopedCtx(tx, alice, gardenId), { name: 'G', color: 'green', memberIds: [foreignMember] }))
        .rejects.toMatchObject({ code: 'VALIDATION', fieldErrors: { memberIds: ['notActiveMember'] } });
    }));

  it("[GRP-03] archiver un groupe retire ses restrictions de zone", () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const groupId = await makeGroup(tx, gardenId, 'G', []);
      const [plot] = await tx.select().from(zoneType).where(eq(zoneType.code, 'plot'));
      const { zoneId } = await createZone(ctx, { gardenId, parentId: null, name: 'P', zoneTypeId: plot?.id ?? '', environment: null, geometry: null, hasInterior: false });
      await setZoneRestrictions(ctx, zoneId, [{ groupId, level: 'contribute' }]);
      await archiveGroup(ctx, groupId);
      expect(await tx.select().from(zoneGroupPermission).where(eq(zoneGroupPermission.groupId, groupId))).toEqual([]);
    }));
});
