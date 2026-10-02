import { and, eq, inArray, isNull, max, ne, sql } from 'drizzle-orm';
import { forbidden, notFound, validation } from '@/lib/errors';
import type { Stage } from '@/lib/enums';
import type { ScopedCtx, ServiceCtx } from '@/server/action-core';
import { canEditGuide, canForkGuide, canReadGuide } from '@/server/authz/content';
import { can, loadScope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { culture, cultureStage, guide, guideVersion, ticket, ticketEvent } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { applyPlannedDates, type PlannedDatesResult } from '../culture/service';
import { insertTicket } from '../ticket/shared';
import { computeCalendar, guideSlug } from './rules.pure';
import type { GuideApplyInput, GuideCreateInput, GuideUpdateInput } from './schema';
import { guideFacts, loadGuide, lockedPrivateGarden } from './queries';

const words = (md: string) => md.split(/\s+/).filter(Boolean).length;

/** Un guide privé est rattaché à un jardin dont l'auteur est membre actif, avec `guide:create_private`. */
async function assertPrivateGarden(tx: Executor, userId: string, gardenId: string | undefined) {
  if (!gardenId) return;
  const scope = await loadScope(tx, userId, gardenId);
  if (!scope || scope.archived || !can(scope, 'guide:create_private')) throw forbidden();
}

/** RG-GUI-01 : création d'un brouillon (privé à l'auteur jusqu'à la publication). */
export async function createGuide(ctx: ServiceCtx, input: GuideCreateInput) {
  const { tx, actor } = ctx;
  if (!actor.emailVerified) throw forbidden('emailNotVerified');
  await assertPrivateGarden(tx, actor.id, input.gardenId);
  const [g] = await tx.insert(guide).values({
    authorId: actor.id, gardenId: input.gardenId ?? null, speciesId: input.speciesId, varietyId: input.varietyId ?? null,
    visibility: input.visibility, slug: `brouillon-${crypto.randomUUID()}`, draft: input.draft,
  }).returning({ id: guide.id });
  if (!g) throw new Error('Insertion du guide échouée');
  await tx.update(guide).set({ slug: guideSlug(input.draft.title, g.id) }).where(eq(guide.id, g.id));
  return { guideId: g.id };
}

/** Réédition du brouillon et des réglages ; seul l'auteur modifie (§5.2). */
export async function updateGuide(ctx: ServiceCtx, input: GuideUpdateInput) {
  const { tx, actor } = ctx;
  const g = await loadGuide(tx, input.guideId);
  if (!canEditGuide(actor, { authorId: g.authorId, deleted: g.deletedAt !== null })) throw notFound('guideNotFound');
  const forced = await lockedPrivateGarden(tx, g);
  if (forced && (input.visibility !== 'private' || input.gardenId !== forced)) throw validation({ visibility: ['forkMustStayPrivate'] });
  await assertPrivateGarden(tx, actor.id, input.gardenId);
  await tx.update(guide).set({ visibility: input.visibility, gardenId: input.gardenId ?? null, varietyId: input.varietyId ?? null, draft: input.draft }).where(eq(guide.id, g.id));
  return { guideId: g.id };
}

/** RG-GUI-02 : publier fige le brouillon dans une version immuable numérotée. */
export async function publishGuide(ctx: ServiceCtx, guideId: string) {
  const { tx, actor, clock } = ctx;
  const g = await loadGuide(tx, guideId);
  if (!canEditGuide(actor, { authorId: g.authorId, deleted: g.deletedAt !== null })) throw notFound('guideNotFound');
  if (g.draft.bodyMd.trim().length === 0) throw validation({ bodyMd: ['required'] });
  const [last] = await tx.select({ n: max(guideVersion.number) }).from(guideVersion).where(eq(guideVersion.guideId, g.id));
  const n = last?.n ?? 0;
  const now = clock.now();
  const [v] = await tx.insert(guideVersion).values({
    guideId: g.id, number: n + 1, title: g.draft.title, bodyMd: g.draft.bodyMd, context: g.draft.context,
    calendarTemplate: g.draft.calendarTemplate, changeNote: g.draft.changeNote ?? null, publishedAt: now,
  }).returning({ id: guideVersion.id, number: guideVersion.number });
  if (!v) throw new Error('Insertion de la version échouée');
  const { changeNote: _published, ...nextDraft } = g.draft;
  await tx.update(guide).set({ currentVersionId: v.id, draft: nextDraft, slug: n === 0 ? guideSlug(g.draft.title, g.id) : g.slug }).where(eq(guide.id, g.id));
  await emit(tx, { type: 'guide.published', subjectType: 'guide', subjectId: g.id, gardenId: g.gardenId, actorId: actor.id, payload: { number: v.number, visibility: g.visibility, words: words(g.draft.bodyMd), firstPublication: n === 0 } }, now);
  if (n === 0 && g.forkedFromVersionId) {
    const [origin] = await tx.select({ authorId: guide.authorId }).from(guideVersion).innerJoin(guide, eq(guide.id, guideVersion.guideId)).where(eq(guideVersion.id, g.forkedFromVersionId)).limit(1);
    await emit(tx, { type: 'guide.forked', subjectType: 'guide', subjectId: g.id, gardenId: g.gardenId, actorId: actor.id, payload: { fromVersionId: g.forkedFromVersionId, fromAuthorId: origin?.authorId ?? '', visibility: g.visibility } }, now);
  }
  return { guideId: g.id, versionId: v.id, number: v.number };
}

/** RG-GUI-04 : le fork est un brouillon copié de la version courante ; privé au même jardin si l'original l'est. */
export async function forkGuide(ctx: ServiceCtx, guideId: string) {
  const { tx, actor } = ctx;
  if (!actor.emailVerified) throw forbidden('emailNotVerified');
  const g = await loadGuide(tx, guideId);
  if (!canForkGuide(actor, await guideFacts(tx, actor, g)) || !g.currentVersionId) throw notFound('guideNotFound');
  const [v] = await tx.select().from(guideVersion).where(eq(guideVersion.id, g.currentVersionId)).limit(1);
  if (!v) throw notFound('guideNotFound');
  const isPrivate = g.visibility === 'private';
  const [f] = await tx.insert(guide).values({
    authorId: actor.id, gardenId: isPrivate ? g.gardenId : null, speciesId: g.speciesId, varietyId: g.varietyId,
    visibility: isPrivate ? 'private' : g.visibility, slug: `brouillon-${crypto.randomUUID()}`, forkedFromVersionId: v.id,
    draft: { title: v.title, bodyMd: v.bodyMd, context: v.context, calendarTemplate: v.calendarTemplate },
  }).returning({ id: guide.id });
  if (!f) throw new Error('Insertion du fork échouée');
  await tx.update(guide).set({ slug: guideSlug(v.title, f.id) }).where(eq(guide.id, f.id));
  return { guideId: f.id };
}

export async function deleteGuide(ctx: ServiceCtx, guideId: string) {
  const { tx, actor, clock } = ctx;
  const g = await loadGuide(tx, guideId);
  if (!canEditGuide(actor, { authorId: g.authorId, deleted: g.deletedAt !== null })) throw notFound('guideNotFound');
  await tx.update(guide).set({ deletedAt: clock.now() }).where(eq(guide.id, g.id));
  return { guideId: g.id };
}

export type ApplyResult = PlannedDatesResult & { tickets?: number };

/**
 * RG-GUI-05 / RG-TCK-11 : applique la version courante d'un guide à une culture. Les tickets de guide encore
 * ouverts de la culture (version précédente comprise) sont annulés, puis ceux du calendrier sont créés (GUI-10).
 */
export async function applyGuide(ctx: ScopedCtx, input: GuideApplyInput): Promise<ApplyResult> {
  const { tx, scope, actor, clock } = ctx;
  if (scope.archived) throw forbidden('gardenArchived');
  const g = await loadGuide(tx, input.guideId);
  if (!canReadGuide(actor, await guideFacts(tx, actor, g)) || !g.currentVersionId) throw notFound('guideNotFound');
  if (g.visibility === 'private' && g.gardenId !== scope.gardenId) throw notFound('guideNotFound');
  const [v] = await tx.select().from(guideVersion).where(eq(guideVersion.id, g.currentVersionId)).limit(1);
  if (!v) throw notFound('guideNotFound');
  const [c] = await tx.select({ id: culture.id, speciesId: culture.speciesId }).from(culture)
    .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, input.cultureId), isNull(culture.deletedAt))).limit(1);
  if (!c) throw notFound('cultureNotFound');
  if (c.speciesId !== g.speciesId) throw validation({ guideId: ['guideOtherSpecies'] });
  const actual: Partial<Record<Stage, string>> = {};
  const planned: Partial<Record<Stage, string>> = {};
  for (const r of await tx.select({ stage: cultureStage.stage, actualOn: cultureStage.actualOn, plannedOn: cultureStage.plannedOn }).from(cultureStage).where(eq(cultureStage.cultureId, c.id))) {
    if (r.actualOn) actual[r.stage] = r.actualOn;
    if (r.plannedOn) planned[r.stage] = r.plannedOn;
  }
  const plan = v.calendarTemplate ? computeCalendar(v.calendarTemplate, input.anchorOn, { actual, planned }) : { stages: {}, tasks: [] };
  const dates = await applyPlannedDates(ctx, c.id, plan.stages, input.overwrite, v.id);
  if (dates.status === 'needsConfirmation') return dates;
  const now = clock.now();
  const open = await tx.select({ id: ticket.id, status: ticket.status }).from(ticket).where(and(
    eq(ticket.gardenId, scope.gardenId), eq(ticket.cultureId, c.id), eq(ticket.source, 'guide'), isNull(ticket.deletedAt),
    inArray(ticket.status, ['todo', 'in_progress', 'blocked']),
  ));
  if (open.length) {
    await tx.update(ticket).set({ status: 'cancelled' }).where(inArray(ticket.id, open.map((t) => t.id)));
    await tx.insert(ticketEvent).values(open.map((t) => ({ ticketId: t.id, actorId: actor.id, kind: 'status' as const, diff: { from: t.status, to: 'cancelled', reason: 'guideReapplied' } })));
  }
  let created = 0;
  for (const task of plan.tasks) {
    const t = await insertTicket(tx, {
      gardenId: scope.gardenId, cultureId: c.id, type: task.type, actionTag: task.actionTag ?? null,
      title: task.title, priority: 'normal', dueOn: task.dueOn, visibleFrom: task.visibleFrom, source: 'guide', sourceGuideVersionId: v.id, createdBy: actor.id,
    }, [], [], []);
    if (t) created += 1;
  }
  await emit(tx, { type: 'guide.applied', subjectType: 'guide', subjectId: g.id, gardenId: scope.gardenId, actorId: actor.id, payload: { versionId: v.id, cultureId: c.id, authorId: g.authorId, tickets: created } }, now);
  return { ...dates, tickets: created };
}

/** Nombre de forks publiés et publics d'un guide (RG-GUI-04). */
export async function publicForkCount(tx: Executor, guideId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(guide)
    .innerJoin(guideVersion, eq(guideVersion.id, guide.forkedFromVersionId))
    .where(and(eq(guideVersion.guideId, guideId), eq(guide.visibility, 'public'), sql`${guide.currentVersionId} is not null`, isNull(guide.deletedAt), eq(guide.hiddenByModeration, false), ne(guide.id, guideId)));
  return r?.n ?? 0;
}
