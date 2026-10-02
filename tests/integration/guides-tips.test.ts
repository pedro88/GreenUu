import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCulture } from '../../src/features/culture/service';
import { compareVersions, guideDetail, listGuidesFor, listPublicGuides, publicGuideBySlug, readableGuide } from '../../src/features/guide/queries';
import { applyGuide, createGuide, forkGuide, publicForkCount, publishGuide, updateGuide } from '../../src/features/guide/service';
import { decideReports, openReportQueue, reportContent } from '../../src/features/moderation/service';
import { createTip, tipFeed, voteTip } from '../../src/features/tip/service';
import type { Actor } from '../../src/server/action-core';
import type { Tx } from '../../src/server/db/client';
import { cultureStage, guide, guideVersion, notification, ticket, tip, tipVote } from '../../src/server/db/schema';
import type { GuideCalendarV1 } from '../../src/lib/content-types';
import { addMember, makeGarden, makeZone, speciesRefId } from './fixtures';
import { ctxFor, inTx, makeUser, scopedCtx } from './helpers';

const TOMATE = speciesRefId('tomate');
const draft = (title: string, bodyMd = 'Semer au chaud, repiquer, tuteurer.', calendarTemplate: GuideCalendarV1 | null = null) => ({ title, bodyMd, context: { v: 1 as const }, calendarTemplate });

async function published(tx: Tx, author: Actor, opts: { visibility?: 'public' | 'unlisted' | 'private'; gardenId?: string; title?: string; calendar?: GuideCalendarV1 } = {}) {
  const ctx = ctxFor(tx, author);
  const { guideId } = await createGuide(ctx, { speciesId: TOMATE, visibility: opts.visibility ?? 'public', gardenId: opts.gardenId, draft: draft(opts.title ?? `Tomates ${Math.random().toString(36).slice(2, 7)}`, undefined, opts.calendar ?? null) });
  await publishGuide(ctx, guideId);
  return guideId;
}

const asModerator = (a: Actor): Actor => ({ ...a, platformRole: 'moderator' });

describe('guides', () => {
  it('[GUI-02] publier à nouveau crée la v2, la v1 est inchangée, et la comparaison affiche le diff', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const ctx = ctxFor(tx, alice);
      const guideId = await published(tx, alice, { title: 'Tomates de plein champ' });
      const g = await readableGuide(tx, alice, guideId);
      await updateGuide(ctx, { guideId, visibility: 'public', draft: { ...g.draft, bodyMd: 'Semer au chaud, repiquer, tuteurer.\nPailler en juin.', changeNote: 'Paillage' } });
      expect(await publishGuide(ctx, guideId)).toMatchObject({ number: 2 });
      const versions = await tx.select().from(guideVersion).where(eq(guideVersion.guideId, guideId));
      expect(versions.find((v) => v.number === 1)?.bodyMd).toBe('Semer au chaud, repiquer, tuteurer.');
      expect(versions.find((v) => v.number === 2)?.changeNote).toBe('Paillage');
      const diff = await compareVersions(tx, alice, guideId, 1, 2);
      expect(diff.body).toContainEqual({ kind: 'added', text: 'Pailler en juin.' });
    }));

  it('[GUI-03] une version de guide ne peut pas être modifiée en base', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const guideId = await published(tx, alice);
      await expect(tx.transaction((sp) => sp.update(guideVersion).set({ bodyMd: 'falsifié' }).where(eq(guideVersion.guideId, guideId))))
        .rejects.toMatchObject({ cause: { message: expect.stringMatching(/immuable/) } });
    }));

  it('[GUI-04] un guide privé au jardin J est introuvable pour un non-membre (404)', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const hugo = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const guideId = await published(tx, alice, { visibility: 'private', gardenId });
      await expect(guideDetail(tx, hugo, guideId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(guideDetail(tx, null, guideId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      // Un rôle plateforme ne donne aucun accès aux données privées (§5.1).
      await expect(guideDetail(tx, asModerator(hugo), guideId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(guideDetail(tx, alice, guideId)).resolves.toMatchObject({ guide: { id: guideId } });
    }));

  it('[GUI-05] un guide non listé est absent des listes et des recherches, mais accessible par son lien', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const guideId = await published(tx, alice, { visibility: 'unlisted', title: 'Tomates secrètes du balcon' });
      const listed = await listPublicGuides(tx, { q: 'secrètes' });
      expect(listed.map((g) => g.id)).not.toContain(guideId);
      expect((await listGuidesFor(tx, bob, { q: 'secrètes' })).map((g) => g.id)).not.toContain(guideId);
      const [row] = await tx.select({ slug: guide.slug }).from(guide).where(eq(guide.id, guideId));
      await expect(publicGuideBySlug(tx, row?.slug ?? '')).resolves.toMatchObject({ guide: { id: guideId } });
      await expect(guideDetail(tx, bob, guideId)).resolves.toMatchObject({ guide: { id: guideId } });
    }));

  it('[GUI-06] le fork public publié incrémente le compteur de l\'original et affiche son origine', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const original = await published(tx, alice, { title: 'Tomates en climat océanique' });
      const { guideId: fork } = await forkGuide(ctxFor(tx, bob), original);
      expect(await publicForkCount(tx, original)).toBe(0);
      await publishGuide(ctxFor(tx, bob), fork);
      expect(await publicForkCount(tx, original)).toBe(1);
      expect((await guideDetail(tx, bob, fork)).origin).toMatchObject({ guideId: original, number: 1, readable: true });
    }));

  it('[GUI-07] le fork d\'un guide privé au jardin J reste privé à J', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'member');
      const original = await published(tx, alice, { visibility: 'private', gardenId });
      const { guideId: fork } = await forkGuide(ctxFor(tx, bob), original);
      const [row] = await tx.select({ visibility: guide.visibility, gardenId: guide.gardenId }).from(guide).where(eq(guide.id, fork));
      expect(row).toEqual({ visibility: 'private', gardenId });
      const g = await readableGuide(tx, bob, fork);
      await expect(updateGuide(ctxFor(tx, bob), { guideId: fork, visibility: 'public', draft: g.draft })).rejects.toMatchObject({ fieldErrors: { visibility: ['forkMustStayPrivate'] } });
    }));

  const calendar: GuideCalendarV1 = {
    v: 1, anchor: 'sowing',
    stages: [{ stage: 'transplanting', offsetDays: 45 }, { stage: 'planting', offsetDays: 60 }],
    tasks: [{ title: 'Tuteurer les tomates', type: 'task', relativeTo: 'planting', offsetDays: 7 }],
  };

  async function tomatoCulture(tx: Tx, owner: Actor) {
    const gardenId = await makeGarden(tx, owner);
    const zoneId = await makeZone(tx, owner, gardenId, 'Planche 1');
    const ctx = await scopedCtx(tx, owner, gardenId);
    const { cultureId } = await createCulture(ctx, { gardenId, zoneId, speciesId: TOMATE, method: 'tray_sowing', anchorDate: '2026-03-01', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true });
    return { gardenId, cultureId, ctx };
  }

  it('[GUI-08] appliquer un calendrier type : dates prévues, tickets de guide aux bonnes échéances, version enregistrée', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const guideId = await published(tx, alice, { calendar });
      const { gardenId, cultureId, ctx } = await tomatoCulture(tx, alice);
      expect(await applyGuide(ctx, { gardenId, cultureId, guideId, anchorOn: '2026-03-01', overwrite: true })).toMatchObject({ status: 'applied', tickets: 1 });
      const stages = await tx.select({ stage: cultureStage.stage, plannedOn: cultureStage.plannedOn }).from(cultureStage).where(eq(cultureStage.cultureId, cultureId));
      expect(stages).toEqual(expect.arrayContaining([{ stage: 'sowing', plannedOn: '2026-03-01' }, { stage: 'transplanting', plannedOn: '2026-04-15' }, { stage: 'planting', plannedOn: '2026-04-30' }]));
      const [t] = await tx.select().from(ticket).where(and(eq(ticket.cultureId, cultureId), eq(ticket.source, 'guide')));
      expect(t).toMatchObject({ title: 'Tuteurer les tomates', dueOn: '2026-05-07', visibleFrom: '2026-05-04' });
      const detail = await guideDetail(tx, alice, guideId);
      expect(t?.sourceGuideVersionId).toBe(detail.version?.id);
    }));

  it('[GUI-09] une date prévue déjà renseignée demande confirmation ; une date réelle n\'est jamais modifiée', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const guideId = await published(tx, alice, { calendar });
      const { gardenId, cultureId, ctx } = await tomatoCulture(tx, alice);
      await tx.update(cultureStage).set({ actualOn: '2026-03-02' }).where(and(eq(cultureStage.cultureId, cultureId), eq(cultureStage.stage, 'sowing')));
      const first = await applyGuide(ctx, { gardenId, cultureId, guideId, anchorOn: '2026-03-01' });
      expect(first.status).toBe('needsConfirmation');
      if (first.status !== 'needsConfirmation') return;
      expect(first.conflicts.map((c) => c.stage)).toContain('planting');
      expect(first.conflicts.map((c) => c.stage)).not.toContain('sowing');
      await applyGuide(ctx, { gardenId, cultureId, guideId, anchorOn: '2026-03-01', overwrite: false });
      const [planting] = await tx.select().from(cultureStage).where(and(eq(cultureStage.cultureId, cultureId), eq(cultureStage.stage, 'planting')));
      expect(planting?.plannedOn).not.toBe('2026-04-30');
      const [sowing] = await tx.select().from(cultureStage).where(and(eq(cultureStage.cultureId, cultureId), eq(cultureStage.stage, 'sowing')));
      expect(sowing?.actualOn).toBe('2026-03-02');
    }));

  it('[GUI-10] appliquer la v2 annule les tickets de guide ouverts de la v1 et crée ceux de la v2', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const guideId = await published(tx, alice, { calendar });
      const { gardenId, cultureId, ctx } = await tomatoCulture(tx, alice);
      await applyGuide(ctx, { gardenId, cultureId, guideId, anchorOn: '2026-03-01', overwrite: true });
      const g = await readableGuide(tx, alice, guideId);
      await updateGuide(ctxFor(tx, alice), { guideId, visibility: 'public', draft: { ...g.draft, calendarTemplate: { ...calendar, tasks: [{ title: 'Effeuiller le bas', type: 'task', relativeTo: 'planting', offsetDays: 30 }] } } });
      await publishGuide(ctxFor(tx, alice), guideId);
      await applyGuide(ctx, { gardenId, cultureId, guideId, anchorOn: '2026-03-01', overwrite: true });
      const rows = await tx.select({ title: ticket.title, status: ticket.status }).from(ticket).where(and(eq(ticket.cultureId, cultureId), eq(ticket.source, 'guide')));
      expect(rows).toEqual(expect.arrayContaining([{ title: 'Tuteurer les tomates', status: 'cancelled' }, { title: 'Effeuiller le bas', status: 'todo' }]));
      expect(rows).toHaveLength(2);
    }));
});

describe('tips', () => {
  async function tipOf(tx: Tx, author: Actor) {
    return (await createTip(ctxFor(tx, author), { body: 'Un voile d’hivernage double sur la mâche.', tags: ['hiver'] })).tipId;
  }

  it('[TIP-01] le tip reprend le geohash4 et le Köppen du jardin et apparaît dans le fil', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const { tipId } = await createTip(ctxFor(tx, alice), { body: 'x'.repeat(120), tags: ['hiver', 'mache'], contextGardenId: gardenId });
      const [row] = await tx.select({ geohash4: tip.geohash4, koppen: tip.koppen }).from(tip).where(eq(tip.id, tipId));
      expect(row?.geohash4).toHaveLength(4);
      expect((await tipFeed(tx, alice, { authorId: alice.id }, null)).map((t) => t.id)).toContain(tipId);
    }));

  it('[TIP-03] on ne vote pas pour son propre tip (service et base)', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const tipId = await tipOf(tx, alice);
      await expect(voteTip(ctxFor(tx, alice), tipId, 1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(tx.transaction((sp) => sp.insert(tipVote).values({ tipId, userId: alice.id, value: 1 })))
        .rejects.toMatchObject({ cause: { message: expect.stringMatching(/propre tip/) } });
    }));

  it('[TIP-04] « utile » puis « pas utile » : un seul vote, de valeur −1', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const tipId = await tipOf(tx, alice);
      await voteTip(ctxFor(tx, bob), tipId, 1);
      expect(await voteTip(ctxFor(tx, bob), tipId, -1)).toMatchObject({ useful: 0, notUseful: 1 });
      const votes = await tx.select().from(tipVote).where(eq(tipVote.tipId, tipId));
      expect(votes).toHaveLength(1);
      expect(votes[0]?.value).toBe(-1);
      expect(await voteTip(ctxFor(tx, bob), tipId, 0)).toMatchObject({ useful: 0, notUseful: 0 });
    }));

  it('[MOD-01] 3 signalements distincts masquent le tip, préviennent l\'auteur et alimentent la file de modération', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const tipId = await tipOf(tx, alice);
      for (let i = 0; i < 3; i += 1) {
        const r = await makeUser(tx);
        const res = await reportContent(ctxFor(tx, r), { target: { kind: 'tip', id: tipId }, reason: 'spam' });
        expect(res.autoHidden).toBe(i === 2);
      }
      const [row] = await tx.select({ hidden: tip.hiddenByModeration }).from(tip).where(eq(tip.id, tipId));
      expect(row?.hidden).toBe(true);
      expect(await tx.select().from(notification).where(and(eq(notification.userId, alice.id), eq(notification.type, 'content_hidden')))).toHaveLength(1);
      expect((await tipFeed(tx, null, { authorId: alice.id }, null)).map((t) => t.id)).not.toContain(tipId);
      const queue = await openReportQueue(tx, asModerator(await makeUser(tx)));
      expect(queue.find((q) => q.target.id === tipId)).toMatchObject({ reports: 3, hidden: true });
    }));

  it('[MOD-01] un seul signalement par personne et par contenu', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const tipId = await tipOf(tx, alice);
      await reportContent(ctxFor(tx, bob), { target: { kind: 'tip', id: tipId }, reason: 'spam' });
      await expect(reportContent(ctxFor(tx, bob), { target: { kind: 'tip', id: tipId }, reason: 'other' })).rejects.toMatchObject({ code: 'CONFLICT' });
    }));

  it('[MOD-02] rejeter les signalements réaffiche le tip ; seule la modération décide', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const tipId = await tipOf(tx, alice);
      for (let i = 0; i < 3; i += 1) await reportContent(ctxFor(tx, await makeUser(tx)), { target: { kind: 'tip', id: tipId }, reason: 'inappropriate' });
      const bob = await makeUser(tx);
      await expect(decideReports(ctxFor(tx, bob), { kind: 'tip', id: tipId }, 'dismissed')).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await decideReports(ctxFor(tx, asModerator(bob)), { kind: 'tip', id: tipId }, 'dismissed');
      const [row] = await tx.select({ hidden: tip.hiddenByModeration }).from(tip).where(eq(tip.id, tipId));
      expect(row?.hidden).toBe(false);
      expect((await tipFeed(tx, null, { authorId: alice.id }, null)).map((t) => t.id)).toContain(tipId);
    }));
});
