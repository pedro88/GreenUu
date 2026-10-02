import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCulture, deleteCulture, recordStage } from '../../src/features/culture/service';
import { createJournalEntry, uploadPhoto } from '../../src/features/journal/service';
import { archiveGroup } from '../../src/features/group/service';
import { leave } from '../../src/features/member/service';
import { setPreference } from '../../src/features/notification/service';
import { dueReminders } from '../../src/features/ticket/jobs';
import { addComment, addChecklistItem, assignTicket, deleteTicket, createTicket, toggleChecklistItem, transitionTicket, updateTicket } from '../../src/features/ticket/commands';
import { materializeSeries } from '../../src/features/ticket/generated';
import { calendarMonth, listTickets, myTasksToday, ticketDetail } from '../../src/features/ticket/queries';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { attachment, notification, ticket, ticketAssignee, ticketChecklistItem, ticketEvent, ticketSeries } from '../../src/server/db/schema';
import type { Actor } from '../../src/server/action-core';
import { memoryStorage, tinyJpegWithExif } from './files';
import { addMember, makeGarden, makeGroup, makeZone, speciesRefId } from './fixtures';
import { inTx, makeUser, NOW, recordingQueue, scopedCtx } from './helpers';

async function setup(tx: Tx) {
  const bruno = await makeUser(tx, { pseudo: `bruno${Math.random().toString(36).slice(2, 7)}` });
  const david = await makeUser(tx, { pseudo: `david${Math.random().toString(36).slice(2, 7)}` });
  const emma = await makeUser(tx, { pseudo: `marie${Math.random().toString(36).slice(2, 7)}` });
  const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
  const davidM = await addMember(tx, gardenId, david, 'member');
  const emmaM = await addMember(tx, gardenId, emma, 'member');
  const serre = await makeZone(tx, bruno, gardenId, 'Serre', 'greenhouse');
  const groupId = await makeGroup(tx, gardenId, 'Équipe serre', [davidM, emmaM]);
  return { bruno, david, emma, gardenId, davidM, emmaM, serre, groupId };
}

const base = (gardenId: string) => ({ gardenId, type: 'task' as const, title: 'Arroser la serre', priority: 'normal' as const, checklist: [], memberIds: [], groupIds: [] });

describe('tickets', () => {
  it('[TCK-01] assigné à un groupe : visible dans « mes tâches » des membres, e-mail à chacun, niveau zone', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const jobs = recordingQueue();
      const { ticketId } = await createTicket(await scopedCtx(tx, s.bruno, s.gardenId, { jobs }), { ...base(s.gardenId), zoneId: s.serre, dueOn: '2026-06-15', groupIds: [s.groupId] });
      for (const u of [s.david, s.emma]) {
        const tasks = (await myTasksToday(tx, u.id, NOW)).flatMap((g) => g.tasks);
        expect(tasks.map((t) => t.id)).toContain(ticketId);
      }
      expect(jobs.jobs.map((j) => j.data.to).sort()).toEqual([s.david.email, s.emma.email].sort());
      const [t] = await tx.select().from(ticket).where(eq(ticket.id, ticketId ?? ''));
      expect(t?.level).toBe('zone');
    }));

  it('[TCK-02] un ticket ne peut viser à la fois une zone et une culture (service et base)', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await expect(createTicket(await scopedCtx(tx, s.bruno, s.gardenId), { ...base(s.gardenId), zoneId: s.serre, cultureId: s.serre })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(tx.transaction((sp) => sp.insert(ticket).values({ gardenId: s.gardenId, zoneId: s.serre, cultureId: s.serre, type: 'task', title: 'Double', createdBy: s.bruno.id }))).rejects.toThrow();
    }));

  it('[TCK-03] un ticket de culture apparaît en filtrant sa zone parente « avec sous-zones »', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const table = await makeZone(tx, s.bruno, s.gardenId, 'Table 1', 'bench', s.serre);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { cultureId } = await createCulture(ctx, { gardenId: s.gardenId, zoneId: table, speciesId: speciesRefId('basilic'), method: 'bought_plants', anchorDate: '2026-05-01', seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: false });
      const { ticketId } = await createTicket(ctx, { ...base(s.gardenId), title: 'Pincer le basilic', cultureId });
      expect((await listTickets(tx, ctx.scope, { zone: s.serre }, '2026-06-15')).map((t) => t.id)).toContain(ticketId);
    }));

  it('[TCK-04] [TCK-05] un membre du groupe le termine pour tous ; un membre ajouté ensuite le voit', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const late = await makeUser(tx);
      const lateM = await addMember(tx, s.gardenId, late, 'member');
      const { ticketId } = await createTicket(await scopedCtx(tx, s.bruno, s.gardenId), { ...base(s.gardenId), dueOn: '2026-06-14', groupIds: [s.groupId] });
      await tx.insert((await import('../../src/server/db/schema')).groupMember).values({ gardenId: s.gardenId, groupId: s.groupId, memberId: lateM });
      expect((await myTasksToday(tx, late.id, NOW)).flatMap((g) => g.tasks).map((t) => t.id)).toContain(ticketId);
      await transitionTicket(await scopedCtx(tx, s.david, s.gardenId), ticketId ?? '', 'done');
      const [t] = await tx.select().from(ticket).where(eq(ticket.id, ticketId ?? ''));
      expect(t).toMatchObject({ status: 'done', completedBy: s.david.id });
      expect((await myTasksToday(tx, s.emma.id, NOW)).flatMap((g) => g.tasks)).toEqual([]);
    }));

  it('[TCK-06] réouverture : first_completed_at conservé, événement tracé', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { ticketId } = await createTicket(ctx, base(s.gardenId));
      await transitionTicket(ctx, ticketId ?? '', 'done');
      await transitionTicket(ctx, ticketId ?? '', 'todo');
      const [t] = await tx.select().from(ticket).where(eq(ticket.id, ticketId ?? ''));
      expect(t?.completedAt).toBeNull();
      expect(t?.firstCompletedAt).not.toBeNull();
      const events = await tx.select().from(ticketEvent).where(eq(ticketEvent.ticketId, ticketId ?? ''));
      expect(events.map((e) => e.diff)).toEqual(expect.arrayContaining([{ from: 'done', to: 'todo' }]));
    }));

  it('[AUTHZ-05] zone restreinte : un membre hors groupe ne peut ni assigner ni cocher un ticket qui ne lui est pas assigné, mais commente', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const asBruno = await scopedCtx(tx, s.bruno, s.gardenId);
      const { ticketId } = await createTicket(asBruno, { ...base(s.gardenId), zoneId: s.serre, checklist: ['Ouvrir la vanne'] });
      const { setZoneRestrictions } = await import('../../src/features/zone/service');
      const other = await makeGroup(tx, s.gardenId, 'Famille Dupont', [s.emmaM]);
      await setZoneRestrictions(asBruno, s.serre, [{ groupId: other, level: 'contribute' }]);
      const [item] = await tx.select({ id: ticketChecklistItem.id }).from(ticketChecklistItem).where(eq(ticketChecklistItem.ticketId, ticketId ?? ''));
      const asDavid = await scopedCtx(tx, s.david, s.gardenId);
      await expect(assignTicket(asDavid, ticketId ?? '', [s.davidM], [])).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(toggleChecklistItem(asDavid, item?.id ?? '', true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(addComment(asDavid, ticketId ?? '', 'Je peux quand même commenter')).resolves.toBeDefined();
      await assignTicket(asBruno, ticketId ?? '', [s.davidM], []);
      await expect(toggleChecklistItem(await scopedCtx(tx, s.david, s.gardenId), item?.id ?? '', true)).resolves.toEqual({ itemId: item?.id });
    }));

  it('[TCK-19] photos jointes à un ticket : rattachées une seule fois, par leur auteur, jamais à une série', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const asDavid = await scopedCtx(tx, s.david, s.gardenId);
      const files = memoryStorage();
      const [a, b] = [await uploadPhoto(tx, asDavid.scope, s.david.id, tinyJpegWithExif(), files), await uploadPhoto(tx, asDavid.scope, s.david.id, tinyJpegWithExif(), files)];
      const { ticketId } = await createTicket(asDavid, { ...base(s.gardenId), attachmentIds: [a.attachmentId, b.attachmentId] });
      const linked = await tx.select({ id: attachment.id }).from(attachment).where(eq(attachment.ticketId, ticketId ?? ''));
      expect(linked).toHaveLength(2);
      // Déjà rattachée : refusée, y compris dans le journal.
      await expect(createTicket(asDavid, { ...base(s.gardenId), attachmentIds: [a.attachmentId] })).rejects.toMatchObject({ fieldErrors: { attachmentIds: ['attachmentInvalid'] } });
      await expect(createJournalEntry(asDavid, { gardenId: s.gardenId, zoneId: s.serre, kind: 'note', body: 'x', attachmentIds: [b.attachmentId] }))
        .rejects.toMatchObject({ fieldErrors: { attachmentIds: ['attachmentInvalid'] } });
      // La photo d'une autre personne ne peut pas être rattachée.
      const c = await uploadPhoto(tx, asDavid.scope, s.david.id, tinyJpegWithExif(), files);
      await expect(createTicket(await scopedCtx(tx, s.emma, s.gardenId), { ...base(s.gardenId), attachmentIds: [c.attachmentId] })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(createTicket(asDavid, { ...base(s.gardenId), attachmentIds: [c.attachmentId], recurrence: { rrule: 'FREQ=DAILY', dtstart: '2026-06-15', skipMissed: true } }))
        .rejects.toMatchObject({ fieldErrors: { attachmentIds: ['attachmentsNotForSeries'] } });
    }));

  it("[AUTHZ-03] un ID de ticket d'un autre jardin dont on est membre donne NOT_FOUND, en lecture comme en écriture", () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const other = await makeGarden(tx, s.bruno, { name: 'J2' });
      const { ticketId } = await createTicket(await scopedCtx(tx, s.bruno, other), { ...base(other), title: 'Ticket de J2', checklist: ['Point'] });
      const id = ticketId ?? '';
      const [item] = await tx.select({ id: ticketChecklistItem.id }).from(ticketChecklistItem).where(eq(ticketChecklistItem.ticketId, id));
      const inJ1 = await scopedCtx(tx, s.bruno, s.gardenId);
      const attempts: [string, () => Promise<unknown>][] = [
        ['ticketDetail', () => ticketDetail(tx, inJ1.scope, id)],
        ['transitionTicket', () => transitionTicket(inJ1, id, 'done')],
        ['updateTicket', () => updateTicket(inJ1, { gardenId: s.gardenId, ticketId: id, type: 'task', title: 'Piraté', priority: 'normal', applyTo: 'this' })],
        ['assignTicket', () => assignTicket(inJ1, id, [], [])],
        ['deleteTicket', () => deleteTicket(inJ1, id)],
        ['addComment', () => addComment(inJ1, id, 'Intrusion')],
        ['addChecklistItem', () => addChecklistItem(inJ1, id, 'Intrusion')],
        ['toggleChecklistItem', () => toggleChecklistItem(inJ1, item?.id ?? '', true)],
      ];
      for (const [name, run] of attempts) await expect(run(), name).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const [row] = await tx.select({ title: ticket.title, status: ticket.status, deletedAt: ticket.deletedAt }).from(ticket).where(eq(ticket.id, id));
      expect(row).toEqual({ title: 'Ticket de J2', status: 'todo', deletedAt: null });
    }));

  it('[TCK-12] checklist : 2 éléments cochés sur 3 → 2/3', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { ticketId } = await createTicket(ctx, { ...base(s.gardenId), checklist: ['Acheter un robinet', 'Réparer le joint', 'Fixer le robinet'] });
      const items = await tx.select().from(ticketChecklistItem).where(eq(ticketChecklistItem.ticketId, ticketId ?? ''));
      const asDavid = await scopedCtx(tx, s.david, s.gardenId);
      for (const i of items.slice(0, 2)) await toggleChecklistItem(asDavid, i.id, true);
      const [row] = await listTickets(tx, ctx.scope, {}, '2026-06-15');
      expect(row?.checklist).toMatchObject({ total: 3, done: 2 });
    }));

  it('[TCK-13] mention d\'un membre notifiée ; mention inconnue laissée en texte', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { ticketId } = await createTicket(ctx, base(s.gardenId));
      await addComment(ctx, ticketId ?? '', `Merci @${s.emma.name} et @inconnu123 !`);
      const notes = await tx.select().from(notification).where(and(eq(notification.userId, s.emma.id), eq(notification.type, 'mentioned')));
      expect(notes).toHaveLength(1);
    }));

  it('[TCK-14] [TCK-15] [TCK-17] ticket de repiquage : échéance, visibilité, suivi des dates, terminé par la date réelle', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { cultureId } = await createCulture(ctx, { gardenId: s.gardenId, zoneId: s.serre, speciesId: speciesRefId('tomate'), method: 'tray_sowing', anchorDate: '2026-05-28', seedSource: 'unknown', plannedDates: { transplanting: '2026-06-18' }, acknowledgeRotation: false });
      const find = async () => (await tx.select().from(ticket).where(and(eq(ticket.cultureId, cultureId), eq(ticket.titleKey, 'stageTicket.transplanting'))))[0];
      const t = await find();
      expect(t).toMatchObject({ dueOn: '2026-06-18', visibleFrom: '2026-06-15', status: 'todo' });
      expect(t?.title).toMatch(/^Repiquer : Tomate/);
      const [a] = await tx.select().from(ticketAssignee).where(eq(ticketAssignee.ticketId, t?.id ?? ''));
      expect(a?.memberId).toBe(ctx.scope.memberId);
      expect((await myTasksToday(tx, s.bruno.id, NOW)).flatMap((g) => g.tasks).some((x) => x.id === t?.id)).toBe(false);
      await recordStage(ctx, { gardenId: s.gardenId, cultureId, stage: 'transplanting', plannedOn: '2026-06-23' });
      expect(await find()).toMatchObject({ dueOn: '2026-06-23', visibleFrom: '2026-06-20' });
      await recordStage(ctx, { gardenId: s.gardenId, cultureId, stage: 'transplanting', actualOn: '2026-06-15' });
      expect((await find())?.status).toBe('done');
    }));

  it('[TCK-16] terminer un ticket d\'étape propose de renseigner la date réelle', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { cultureId } = await createCulture(ctx, { gardenId: s.gardenId, zoneId: s.serre, speciesId: speciesRefId('tomate'), method: 'tray_sowing', anchorDate: '2026-05-28', seedSource: 'unknown', plannedDates: { transplanting: '2026-06-16' }, acknowledgeRotation: false });
      const [t] = await tx.select().from(ticket).where(and(eq(ticket.cultureId, cultureId), eq(ticket.titleKey, 'stageTicket.transplanting')));
      const res = await transitionTicket(ctx, t?.id ?? '', 'done');
      expect(res.stagePrompt).toEqual({ cultureId, stage: 'transplanting' });
    }));

  it('[TCK-18] un ticket visible dans 10 jours n\'est que dans « à venir » et le calendrier', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { ticketId } = await createTicket(ctx, { ...base(s.gardenId), dueOn: '2026-06-25' });
      await tx.update(ticket).set({ visibleFrom: '2026-06-25' }).where(eq(ticket.id, ticketId ?? ''));
      expect((await listTickets(tx, ctx.scope, {}, '2026-06-15')).map((t) => t.id)).not.toContain(ticketId);
      expect((await listTickets(tx, ctx.scope, { echeance: 'avenir' }, '2026-06-15')).map((t) => t.id)).toContain(ticketId);
      expect((await calendarMonth(tx, ctx.scope, '2026-06', '2026-06-15')).map((t) => t.id)).toContain(ticketId);
    }));

  it('[CUL-07] supprimer une culture annule ses tickets ouverts', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { cultureId } = await createCulture(ctx, { gardenId: s.gardenId, zoneId: s.serre, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-06-20', seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: false });
      const { ticketId } = await createTicket(ctx, { ...base(s.gardenId), title: 'Tuteurer', cultureId });
      await deleteCulture(ctx, cultureId);
      const rows = await tx.select({ status: ticket.status }).from(ticket).where(eq(ticket.cultureId, cultureId));
      expect(rows.length).toBeGreaterThan(1);
      expect(rows.every((r) => r.status === 'cancelled')).toBe(true);
      void ticketId;
    }));

  it('[ZON-10] un ticket peut être créé sur un composteur', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const compost = await makeZone(tx, s.bruno, s.gardenId, 'Composteur', 'compost');
      await expect(createTicket(await scopedCtx(tx, s.bruno, s.gardenId), { ...base(s.gardenId), type: 'maintenance', title: 'Retourner le compost', zoneId: compost })).resolves.toMatchObject({ ticketId: expect.any(String) });
    }));

  it('[JRN-05] arroser une culture termine le ticket d\'arrosage échu de sa zone parente', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const table = await makeZone(tx, s.bruno, s.gardenId, 'Table 1', 'bench', s.serre);
      const ctx = await scopedCtx(tx, s.bruno, s.gardenId);
      const { cultureId } = await createCulture(ctx, { gardenId: s.gardenId, zoneId: table, speciesId: speciesRefId('basilic'), method: 'bought_plants', anchorDate: '2026-05-01', seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: false });
      const { ticketId } = await createTicket(ctx, { ...base(s.gardenId), actionTag: 'watering', zoneId: s.serre, dueOn: '2026-06-14' });
      await createJournalEntry(ctx, { gardenId: s.gardenId, cultureId, kind: 'intervention', intervention: 'watering', attachmentIds: [] });
      const [t] = await tx.select().from(ticket).where(eq(ticket.id, ticketId ?? ''));
      expect(t?.status).toBe('done');
    }));

  it('[MBR-01] un membre qui part perd ses assignations directes ; les admins sont notifiés', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { ticketId } = await createTicket(await scopedCtx(tx, s.bruno, s.gardenId), { ...base(s.gardenId), memberIds: [s.davidM] });
      await leave(await scopedCtx(tx, s.david, s.gardenId));
      expect(await tx.select().from(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId ?? ''))).toEqual([]);
      expect(await tx.select().from(notification).where(and(eq(notification.userId, s.bruno.id), eq(notification.type, 'member_left_unassigned')))).toHaveLength(1);
    }));

  it('[GRP-03] archiver un groupe retire ses assignations aux tickets ouverts et prévient le créateur', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const admin = await makeUser(tx);
      await addMember(tx, s.gardenId, admin, 'admin');
      const { ticketId } = await createTicket(await scopedCtx(tx, admin, s.gardenId), { ...base(s.gardenId), groupIds: [s.groupId] });
      await archiveGroup(await scopedCtx(tx, s.bruno, s.gardenId), s.groupId);
      expect(await tx.select().from(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId ?? ''))).toEqual([]);
      expect(await tx.select().from(notification).where(and(eq(notification.userId, admin.id), eq(notification.type, 'group_archived_unassigned')))).toHaveLength(1);
    }));
});

describe('récurrence', () => {
  async function series(tx: Tx, s: { bruno: Actor; gardenId: string; serre: string }, today = '2026-07-01') {
    const ctx = await scopedCtx(tx, s.bruno, s.gardenId, { clock: fixedClock(new Date(`${today}T08:00:00Z`)) });
    const { seriesId } = await createTicket(ctx, { ...base(s.gardenId), actionTag: 'watering', zoneId: s.serre, recurrence: { rrule: 'FREQ=DAILY;INTERVAL=2;BYMONTH=7', dtstart: '2026-07-01', skipMissed: true } });
    const [row] = await tx.select().from(ticketSeries).where(eq(ticketSeries.id, seriesId ?? ''));
    if (!row) throw new Error('série');
    return { ctx, s: row };
  }

  it('[RCR-02] la matérialisation est idempotente', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { s: row } = await series(tx, s);
      await materializeSeries(tx, row, '2026-07-01');
      const rows = await tx.select({ d: ticket.occurrenceOn }).from(ticket).where(eq(ticket.seriesId, row.id));
      expect(rows.map((r) => r.d).sort()).toEqual(['2026-07-01', '2026-07-03', '2026-07-05', '2026-07-07', '2026-07-09', '2026-07-11', '2026-07-13', '2026-07-15']);
    }));

  it('[RCR-03] une occurrence manquée passe « sautée » quand la suivante est échue, sans alerte de retard', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { s: row } = await series(tx, s);
      await materializeSeries(tx, row, '2026-07-05');
      const byDate = async (d: string) => (await tx.select().from(ticket).where(and(eq(ticket.seriesId, row.id), eq(ticket.occurrenceOn, d))))[0];
      expect((await byDate('2026-07-03'))?.status).toBe('skipped');
      expect((await byDate('2026-07-05'))?.status).toBe('todo');
      const jobs = recordingQueue();
      await dueReminders(tx, jobs, 'http://x', new Date('2026-07-06T10:00:00Z'));
      expect(await tx.select().from(notification).where(and(eq(notification.type, 'overdue'), eq(notification.gardenId, s.gardenId)))).toEqual([]);
    }));

  it('[RCR-04] « celle-ci et les suivantes » met à jour les occurrences futures non terminées', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { ctx, s: row } = await series(tx, s);
      const occ = await tx.select().from(ticket).where(eq(ticket.seriesId, row.id)).orderBy(ticket.occurrenceOn);
      await transitionTicket(ctx, occ[0]?.id ?? '', 'done');
      await updateTicket(ctx, { gardenId: s.gardenId, ticketId: occ[2]?.id ?? '', type: 'task', title: 'Arroser la serre (soir)', priority: 'normal', applyTo: 'following' });
      const after = await tx.select().from(ticket).where(eq(ticket.seriesId, row.id)).orderBy(ticket.occurrenceOn);
      expect(after.slice(2).every((t) => t.title === 'Arroser la serre (soir)')).toBe(true);
      expect(after[0]?.title).toBe('Arroser la serre');
      expect(after[1]?.title).toBe('Arroser la serre');
    }));

  it('[RCR-05] « cette occurrence seulement » la détache de la série', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { ctx, s: row } = await series(tx, s);
      const occ = await tx.select().from(ticket).where(eq(ticket.seriesId, row.id)).orderBy(ticket.occurrenceOn);
      await updateTicket(ctx, { gardenId: s.gardenId, ticketId: occ[1]?.id ?? '', type: 'task', title: 'Arroser avec purin', priority: 'high', applyTo: 'this' });
      await updateTicket(ctx, { gardenId: s.gardenId, ticketId: occ[0]?.id ?? '', type: 'task', title: 'Arroser (nouveau)', priority: 'normal', applyTo: 'following' });
      const [detached] = await tx.select().from(ticket).where(eq(ticket.id, occ[1]?.id ?? ''));
      expect(detached).toMatchObject({ detached: true, seriesId: row.id, title: 'Arroser avec purin' });
    }));

  it('[TCK-11] le calendrier montre des occurrences virtuelles au-delà de l\'horizon', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { ctx } = await series(tx, s);
      const items = await calendarMonth(tx, ctx.scope, '2026-07', '2026-07-01');
      expect(items.filter((i) => i.virtual).map((i) => i.dueOn)).toEqual(['2026-07-17', '2026-07-19', '2026-07-21', '2026-07-23', '2026-07-25', '2026-07-27', '2026-07-29', '2026-07-31']);
      expect(items.filter((i) => i.virtual).every((i) => i.id === null)).toBe(true);
    }));
});

describe('notifications', () => {
  it('[NTF-01] rappel la veille à 8 h, une seule fois', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { ticketId } = await createTicket(await scopedCtx(tx, s.bruno, s.gardenId), { ...base(s.gardenId), dueOn: '2026-06-16', memberIds: [s.davidM] });
      const jobs = recordingQueue();
      await dueReminders(tx, jobs, 'http://x', new Date('2026-06-15T04:00:00Z')); // 6 h à Bruxelles
      expect(jobs.jobs).toHaveLength(0);
      await dueReminders(tx, jobs, 'http://x', new Date('2026-06-15T06:30:00Z')); // 8 h 30
      await dueReminders(tx, jobs, 'http://x', new Date('2026-06-15T07:00:00Z'));
      expect(jobs.jobs.filter((j) => j.data.to === s.david.email)).toHaveLength(1);
      void ticketId;
    }));

  it('[NTF-02] e-mail « assigné » désactivé : notification in-app seulement', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await setPreference(tx, s.david.id, 'assigned', 'email', false);
      const jobs = recordingQueue();
      await createTicket(await scopedCtx(tx, s.bruno, s.gardenId, { jobs }), { ...base(s.gardenId), memberIds: [s.davidM] });
      expect(jobs.jobs).toHaveLength(0);
      expect(await tx.select().from(notification).where(and(eq(notification.userId, s.david.id), eq(notification.type, 'assigned')))).toHaveLength(1);
    }));

  it('[NTF-03] on n\'est jamais notifié de ses propres actions', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const ctx = await scopedCtx(tx, s.david, s.gardenId);
      const { ticketId } = await createTicket(ctx, base(s.gardenId));
      await assignTicket(ctx, ticketId ?? '', [s.davidM], []);
      expect(await tx.select().from(notification).where(eq(notification.userId, s.david.id))).toEqual([]);
    }));

  it('[NTF-05] un succès ne part jamais par e-mail', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      await setPreference(tx, s.david.id, 'achievement', 'email', true);
      const { notify } = await import('../../src/features/notification/service');
      const jobs = recordingQueue();
      await notify(tx, jobs, 'http://x', { userIds: [s.david.id], type: 'achievement', gardenId: null, groupKey: 'first_harvest', actorId: null, now: NOW, payload: { title: 'Première récolte', url: '/app/profil/succes' } });
      expect(jobs.jobs).toHaveLength(0);
      expect(await tx.select().from(notification).where(and(eq(notification.userId, s.david.id), eq(notification.type, 'achievement')))).toHaveLength(1);
    }));

  it('[NTF-06] 4 commentaires en 5 minutes : une seule notification groupée', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { ticketId } = await createTicket(await scopedCtx(tx, s.david, s.gardenId), base(s.gardenId));
      for (let i = 0; i < 4; i++) {
        await addComment(await scopedCtx(tx, s.bruno, s.gardenId, { clock: fixedClock(new Date(NOW.getTime() + i * 60_000)) }), ticketId ?? '', `Remarque ${i}`);
      }
      const rows = await tx.select().from(notification).where(and(eq(notification.userId, s.david.id), eq(notification.type, 'commented')));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.count).toBe(4);
    }));
});

describe('isolation des notifications', () => {
  it('[NTF-07] le centre de notifications ne liste que les siennes, lues ou non', () =>
    inTx(async (tx) => {
      const s = await setup(tx);
      const { notify, listNotifications } = await import('../../src/features/notification/service');
      const send = (userId: string, title: string) => notify(tx, recordingQueue(), 'http://x', { userIds: [userId], type: 'quest', gardenId: null, groupKey: title, actorId: null, now: NOW, payload: { title, url: '/app' } });
      await send(s.david.id, 'pour david');
      await send(s.emma.id, 'pour emma');
      const mine = await listNotifications(tx, s.emma.id);
      expect(mine.map((n) => n.payload.title)).toEqual(['pour emma']);
      expect(mine.every((n) => n.userId === s.emma.id)).toBe(true);
    }));
});
