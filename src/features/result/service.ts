import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { forbidden, notFound, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can, type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { consent, culture, cultureResult, cultureResultProblem, garden, journalEntry } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import type { JobQueue } from '@/server/jobs/queues';
import { cultureDetail } from '../culture/queries';
import { assertZoneContribute } from '../zone/service';
import { completeness, yieldKgM2 } from './rules.pure';
import type { ResultSubmitInput } from './schema';

/** Version du texte de consentement au partage affiché à l'owner (§11.2). */
export const SHARE_CONSENT_VERSION = 'partage-2026-10';
const REFRESH_DEBOUNCE_S = 300;

/** §3.6 : `reco.refresh-facts` 5 min après un bilan ou un changement de partage, une seule fois par fenêtre. */
export async function scheduleFactsRefresh(jobs: JobQueue) {
  await jobs.enqueue('reco.refresh-facts', {}, { singletonKey: 'reco.refresh-facts', startAfter: REFRESH_DEBOUNCE_S });
}

/** Le bilan est proposé une fois la culture terminée ou en échec, ou dès la première récolte (RG-RES-01). */
function canHaveResult(status: string, totalKg: number, harvests: number) {
  return ['finished', 'failed', 'abandoned'].includes(status) || totalKg > 0 || harvests > 0;
}

/**
 * Données du formulaire de bilan : bilan existant, ou valeurs pré-remplies (RG-RES-02) — total des récoltes
 * convertibles, surface connue, problèmes relevés au journal (RES-02).
 */
export async function resultForm(tx: Executor, scope: Scope, cultureId: string) {
  const d = await cultureDetail(tx, scope, cultureId);
  if (d.c.deletedAt) throw notFound('cultureNotFound');
  const [existing] = await tx.select().from(cultureResult).where(and(eq(cultureResult.cultureId, cultureId), eq(cultureResult.seasonId, d.c.seasonId))).limit(1);
  const existingProblems = existing ? await tx.select({ problemId: cultureResultProblem.problemId, severity: cultureResultProblem.severity }).from(cultureResultProblem).where(eq(cultureResultProblem.resultId, existing.id)) : [];
  const journalProblems = await tx.selectDistinct({ problemId: journalEntry.problemId, severity: journalEntry.severity }).from(journalEntry)
    .where(and(eq(journalEntry.cultureId, cultureId), inArray(journalEntry.kind, ['disease', 'pest']), isNotNull(journalEntry.problemId), isNull(journalEntry.deletedAt)));
  const prefilledProblems = new Map<string, number>();
  for (const p of journalProblems) if (p.problemId) prefilledProblems.set(p.problemId, Math.max(prefilledProblems.get(p.problemId) ?? 0, p.severity ?? 2));
  return {
    detail: d,
    available: canHaveResult(d.c.status, d.totalKg, d.harvests.length),
    existing: existing ?? null,
    problems: existing ? existingProblems : [...prefilledProblems.entries()].map(([problemId, severity]) => ({ problemId, severity })),
    prefill: { totalKg: existing?.totalKg ?? (d.totalKg > 0 ? d.totalKg : null), areaM2: d.area.m2 },
  };
}

/** RG-RES-01 à 04 : saisie ou mise à jour du bilan de la saison (RES-05 : jamais de doublon). */
export async function submitResult(ctx: ScopedCtx, input: ResultSubmitInput) {
  const { tx, scope, actor, clock, jobs } = ctx;
  if (scope.archived) throw forbidden('gardenArchived');
  const form = await resultForm(tx, scope, input.cultureId);
  await assertZoneContribute(tx, scope, 'result:submit', form.detail.c.zoneId);
  if (!form.available) throw validation({ cultureId: ['resultTooEarly'] });
  const problemsReviewed = input.noProblem || input.problems.length > 0;
  const totalKg = input.noHarvest ? null : input.totalKg;
  const fields = { totalKg, noHarvest: input.noHarvest, quality: input.quality, successPct: input.successPct, rating: input.rating, wouldGrowAgain: input.wouldGrowAgain, problemsReviewed };
  const values = {
    ...fields, areaM2: form.prefill.areaM2, yieldKgM2: input.noHarvest ? null : yieldKgM2(totalKg, form.prefill.areaM2),
    notes: input.notes ?? null, completeness: completeness(fields), authorId: actor.id, submittedAt: clock.now(),
  };
  const [row] = await tx.insert(cultureResult).values({ gardenId: scope.gardenId, cultureId: input.cultureId, seasonId: form.detail.c.seasonId, ...values })
    .onConflictDoUpdate({ target: [cultureResult.cultureId, cultureResult.seasonId], set: values })
    .returning({ id: cultureResult.id, createdAt: cultureResult.createdAt, updatedAt: cultureResult.updatedAt });
  if (!row) throw new Error('Enregistrement du bilan échoué');
  await tx.delete(cultureResultProblem).where(eq(cultureResultProblem.resultId, row.id));
  if (input.problems.length) await tx.insert(cultureResultProblem).values(input.problems.map((p) => ({ resultId: row.id, problemId: p.problemId, severity: p.severity })));
  const updated = form.existing !== null;
  await emit(tx, { type: updated ? 'result.updated' : 'result.submitted', subjectType: 'result', subjectId: row.id, gardenId: scope.gardenId, actorId: actor.id, payload: { cultureId: input.cultureId, completeness: values.completeness } }, clock.now());
  await scheduleFactsRefresh(jobs);
  return { resultId: row.id, completeness: values.completeness, yieldKgM2: values.yieldKgM2, updated };
}

/**
 * §11.2 / RG-RES-05 : seul l'owner active ou révoque le partage anonymisé des bilans (PRV-02, PRV-03).
 * L'activation trace un consentement versionné ; la révocation le clôt. La vue suit au rafraîchissement suivant.
 */
export async function setResultSharing(ctx: ScopedCtx, enabled: boolean, consentVersion = SHARE_CONSENT_VERSION) {
  const { tx, scope, actor, clock, jobs } = ctx;
  if (!can(scope, 'garden:share_results')) throw forbidden();
  const now = clock.now();
  await tx.update(garden).set({ shareResults: enabled }).where(eq(garden.id, scope.gardenId));
  if (enabled) await tx.insert(consent).values({ userId: actor.id, gardenId: scope.gardenId, kind: 'share_results', version: consentVersion, grantedAt: now });
  else await tx.update(consent).set({ revokedAt: now }).where(and(eq(consent.gardenId, scope.gardenId), eq(consent.kind, 'share_results'), isNull(consent.revokedAt)));
  await emit(tx, { type: 'garden.updated', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: actor.id, payload: { fields: ['shareResults'] } }, now);
  await scheduleFactsRefresh(jobs);
  return { enabled };
}

/** Bilans de la saison d'une culture, pour la fiche (lien « bilan »). */
export async function resultOf(tx: Executor, scope: Scope, cultureId: string) {
  const [r] = await tx.select({ id: cultureResult.id, completeness: cultureResult.completeness }).from(cultureResult).innerJoin(culture, eq(culture.id, cultureResult.cultureId))
    .where(and(eq(cultureResult.gardenId, scope.gardenId), eq(cultureResult.cultureId, cultureId), eq(cultureResult.seasonId, culture.seasonId))).limit(1);
  return r ?? null;
}

/** Le jardin partage-t-il ses bilans (bandeau des membres, formulaire de bilan, paramètres) ? */
export async function sharingState(tx: Executor, gardenId: string) {
  const [g] = await tx.select({ shared: garden.shareResults }).from(garden).where(eq(garden.id, gardenId)).limit(1);
  return g?.shared ?? false;
}
