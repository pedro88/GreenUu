import { and, count, countDistinct, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DomainError, forbidden, notFound } from '@/lib/errors';
import type { ReportReason } from '@/lib/enums';
import type { ServiceCtx } from '@/server/action-core';
import { canReadGuide, isModerator } from '@/server/authz/content';
import type { Executor } from '@/server/db/client';
import { contentReport, guide, guideVersion, tip, user, userProfile } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { guideFacts, loadGuide } from '../guide/queries';
import { notify } from '../notification/service';
import type { ReportInput } from '../tip/schema';

/** RG-MOD-02 : seuil de masquage automatique (signalements ouverts de personnes distinctes). */
export const AUTO_HIDE_THRESHOLD = 3;

type Target = ReportInput['target'];

const targetColumn = (t: Target) => (t.kind === 'guide' ? contentReport.guideId : t.kind === 'tip' ? contentReport.tipId : contentReport.reportedUserId);

/** Auteur du contenu visé (le profil signalé est sa propre « auteure »), en vérifiant que le signaleur peut le voir. */
async function targetAuthor(tx: Executor, ctx: ServiceCtx, t: Target): Promise<{ authorId: string; title: string; url: string }> {
  if (t.kind === 'guide') {
    const g = await loadGuide(tx, t.id);
    if (!canReadGuide(ctx.actor, await guideFacts(tx, ctx.actor, g))) throw notFound('guideNotFound');
    return { authorId: g.authorId, title: g.draft.title, url: `/app/guides/${g.id}` };
  }
  if (t.kind === 'tip') {
    const [x] = await tx.select({ authorId: tip.authorId, body: tip.body }).from(tip).where(and(eq(tip.id, t.id), isNull(tip.deletedAt))).limit(1);
    if (!x) throw notFound();
    return { authorId: x.authorId, title: x.body.slice(0, 60), url: '/app/tips' };
  }
  const [p] = await tx.select({ pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, t.id)).limit(1);
  if (!p) throw notFound();
  return { authorId: t.id, title: p.pseudo, url: `/app/jardiniers/${p.pseudo}` };
}

async function setHidden(tx: Executor, t: Target, hidden: boolean) {
  if (t.kind === 'guide') await tx.update(guide).set({ hiddenByModeration: hidden }).where(eq(guide.id, t.id));
  if (t.kind === 'tip') await tx.update(tip).set({ hiddenByModeration: hidden }).where(eq(tip.id, t.id));
}

/**
 * RG-MOD-01 / 02 : un signalement par personne et par contenu ; à 3 signalements ouverts de personnes
 * distinctes, le guide ou le tip est masqué en attendant la modération, et son auteur est prévenu.
 */
export async function reportContent(ctx: ServiceCtx, input: ReportInput) {
  const { tx, actor, clock, jobs, appUrl } = ctx;
  if (!actor.emailVerified) throw forbidden('emailNotVerified');
  const target = await targetAuthor(tx, ctx, input.target);
  if (target.authorId === actor.id) throw forbidden('ownContent');
  const col = targetColumn(input.target);
  const [already] = await tx.select({ id: contentReport.id }).from(contentReport).where(and(eq(contentReport.reporterId, actor.id), eq(col, input.target.id))).limit(1);
  if (already) throw new DomainError('CONFLICT', 'alreadyReported');
  await tx.insert(contentReport).values({
    reporterId: actor.id, reason: input.reason, details: input.details ?? null,
    guideId: input.target.kind === 'guide' ? input.target.id : null, tipId: input.target.kind === 'tip' ? input.target.id : null,
    reportedUserId: input.target.kind === 'user' ? input.target.id : null,
  });
  const [open] = await tx.select({ n: countDistinct(contentReport.reporterId) }).from(contentReport).where(and(eq(col, input.target.id), eq(contentReport.status, 'open')));
  const openReports = open?.n ?? 0;
  const autoHidden = input.target.kind !== 'user' && openReports >= AUTO_HIDE_THRESHOLD && !(await isHidden(tx, input.target));
  if (autoHidden) {
    await setHidden(tx, input.target, true);
    await notify(tx, jobs, appUrl, { userIds: [target.authorId], type: 'content_hidden', gardenId: null, groupKey: input.target.id, actorId: null, now: clock.now(), payload: { title: target.title, url: target.url } });
  }
  await emit(tx, { type: 'content.reported', subjectType: input.target.kind, subjectId: input.target.id, gardenId: null, actorId: actor.id, payload: { reason: input.reason, openReports, autoHidden } }, clock.now());
  return { openReports, autoHidden };
}

async function isHidden(tx: Executor, t: Target) {
  if (t.kind === 'guide') return (await tx.select({ h: guide.hiddenByModeration }).from(guide).where(eq(guide.id, t.id)))[0]?.h ?? false;
  if (t.kind === 'tip') return (await tx.select({ h: tip.hiddenByModeration }).from(tip).where(eq(tip.id, t.id)))[0]?.h ?? false;
  return false;
}

/**
 * RG-MOD-03 : décision sur tous les signalements ouverts d'un contenu. `dismissed` réaffiche le contenu ;
 * `actioned` le laisse masqué et prévient l'auteur avec le motif. Les décisions sont tracées (statut, auteur, date, événement).
 */
export async function decideReports(ctx: ServiceCtx, target: Target, decision: 'dismissed' | 'actioned') {
  const { tx, actor, clock, jobs, appUrl } = ctx;
  if (!isModerator(actor)) throw forbidden();
  const col = targetColumn(target);
  const open = await tx.select({ id: contentReport.id, reason: contentReport.reason }).from(contentReport).where(and(eq(col, target.id), eq(contentReport.status, 'open')));
  if (open.length === 0) throw notFound('noOpenReport');
  const now = clock.now();
  await tx.update(contentReport).set({ status: decision, handledBy: actor.id, handledAt: now }).where(inArray(contentReport.id, open.map((r) => r.id)));
  await setHidden(tx, target, decision === 'actioned');
  if (decision === 'actioned') {
    const author = await authorOf(tx, target);
    const reason = mostFrequent(open.map((r) => r.reason));
    if (author) await notify(tx, jobs, appUrl, { userIds: [author.id], type: 'moderation_decision', gardenId: null, groupKey: target.id, actorId: actor.id, now, payload: { title: author.title, url: author.url, excerpt: reason } });
  }
  await emit(tx, { type: 'moderation.decided', subjectType: target.kind, subjectId: target.id, gardenId: null, actorId: actor.id, payload: { decision, reports: open.length } }, now);
  return { reports: open.length };
}

async function authorOf(tx: Executor, t: Target) {
  if (t.kind === 'guide') return (await tx.select({ id: guide.authorId, title: sql<string>`${guide.draft}->>'title'` }).from(guide).where(eq(guide.id, t.id))).map((r) => ({ ...r, url: `/app/guides/${t.id}` }))[0];
  if (t.kind === 'tip') return (await tx.select({ id: tip.authorId, title: sql<string>`left(${tip.body}, 60)` }).from(tip).where(eq(tip.id, t.id))).map((r) => ({ ...r, url: '/app/tips' }))[0];
  return { id: t.id, title: '', url: '/app' };
}

function mostFrequent(reasons: ReportReason[]): ReportReason {
  const counts = new Map<ReportReason, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other';
}

/** File de `/admin/signalements` : un élément par contenu, avec le nombre de signalements ouverts et les motifs. */
export async function openReportQueue(tx: Executor, viewer: ServiceCtx['actor']) {
  if (!isModerator(viewer)) throw forbidden();
  const rows = await tx.select({
    guideId: contentReport.guideId, tipId: contentReport.tipId, reportedUserId: contentReport.reportedUserId,
    reports: count(), reasons: sql<ReportReason[]>`array_agg(distinct ${contentReport.reason})`, lastAt: sql<Date>`max(${contentReport.createdAt})`,
    guideTitle: sql<string | null>`max(${guideVersion.title})`, tipBody: sql<string | null>`max(${tip.body})`, pseudo: sql<string | null>`max(${userProfile.pseudo})`,
    hidden: sql<boolean>`bool_or(coalesce(${guide.hiddenByModeration}, ${tip.hiddenByModeration}, false))`,
  }).from(contentReport)
    .leftJoin(guide, eq(guide.id, contentReport.guideId)).leftJoin(guideVersion, eq(guideVersion.id, guide.currentVersionId))
    .leftJoin(tip, eq(tip.id, contentReport.tipId)).leftJoin(user, eq(user.id, contentReport.reportedUserId)).leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(contentReport.status, 'open'))
    .groupBy(contentReport.guideId, contentReport.tipId, contentReport.reportedUserId)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${contentReport.createdAt})`)).limit(200);
  return rows.map((r) => ({
    ...r,
    target: (r.guideId ? { kind: 'guide' as const, id: r.guideId } : r.tipId ? { kind: 'tip' as const, id: r.tipId } : { kind: 'user' as const, id: r.reportedUserId ?? '' }),
    label: r.guideTitle ?? r.tipBody ?? r.pseudo ?? '',
  }));
}
