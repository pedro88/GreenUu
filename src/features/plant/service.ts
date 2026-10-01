import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { DomainError, forbidden, notFound } from '@/lib/errors';
import { normalizeSearch } from '@/lib/text';
import type { ServiceCtx } from '@/server/action-core';
import type { Executor } from '@/server/db/client';
import { botanicalFamily, companion, culture, gardenMember, species, speciesCalendar, variety } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { companionsOf } from './companions.pure';
import type { VarietyModerateInput, VarietyProposeInput } from './schema';

/** Jardins actifs de l'utilisateur (sous-requête de visibilité des variétés proposées). */
const myGardens = (userId: string) =>
  sql`(select ${gardenMember.gardenId} from ${gardenMember} where ${gardenMember.userId} = ${userId} and ${gardenMember.leftAt} is null)`;

/**
 * Visibilité d'une variété (RG-PLT-02 / 03) : approuvée, ou proposée par l'utilisateur, ou proposée
 * dans un de ses jardins et non fusionnée. Les variétés refusées restent cantonnées à ce jardin.
 */
export function visibleVariety(userId: string): SQL {
  return or(
    eq(variety.status, 'approved'),
    and(ne(variety.status, 'merged'), or(eq(variety.proposedBy, userId), sql`${variety.proposedGardenId} in ${myGardens(userId)}`)),
  ) ?? sql`false`;
}

/** Utilisable dans le jardin `gardenId` : approuvée, ou en attente / refusée mais proposée pour ce jardin. */
export async function assertVarietyUsable(tx: Executor, varietyId: string, speciesId: string, gardenId: string) {
  const [v] = await tx.select().from(variety).where(eq(variety.id, varietyId)).limit(1);
  if (!v || v.status === 'merged' || (v.status !== 'approved' && v.proposedGardenId !== gardenId)) throw new DomainError('VALIDATION', 'validation', { varietyId: ['varietyNotUsable'] });
  if (v.speciesId !== speciesId) throw new DomainError('VALIDATION', 'validation', { varietyId: ['varietyOtherSpecies'] });
  return v;
}

export type PlantSearchHit =
  | { kind: 'species'; id: string; name: string; latinName: string; familyCode: string; spriteKey: string | null; score: number }
  | { kind: 'variety'; id: string; speciesId: string; name: string; speciesName: string; status: string; spriteKey: string | null; score: number };

/** RG-PLT-04 : recherche tolérante (trigrammes sur noms normalisés), espèces et variétés mêlées. */
export async function searchPlants(tx: Executor, userId: string, query: string, limit = 20): Promise<PlantSearchHit[]> {
  const q = normalizeSearch(query);
  if (q.length < 2) return [];
  const sScore = sql<number>`greatest(word_similarity(${q}, ${species.searchText}), similarity(${q}, ${species.searchText}))`;
  const speciesRows = await tx.select({
    id: species.id, latinName: species.latinName, names: species.commonNames, familyCode: botanicalFamily.code, spriteKey: species.spriteKey, score: sScore,
  }).from(species).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .where(or(sql`${sScore} > 0.35`, sql`${species.searchText} like ${`%${q}%`}`)).orderBy(sql`${sScore} desc`).limit(limit);
  const vScore = sql<number>`greatest(word_similarity(${q}, ${variety.searchText}), similarity(${q}, ${variety.searchText}))`;
  const varietyRows = await tx.select({
    id: variety.id, speciesId: variety.speciesId, name: variety.name, status: variety.status, speciesNames: species.commonNames,
    spriteKey: sql<string | null>`coalesce(${variety.spriteKey}, ${species.spriteKey})`, score: vScore,
  }).from(variety).innerJoin(species, eq(species.id, variety.speciesId))
    .where(and(visibleVariety(userId), or(sql`${vScore} > 0.35`, sql`${variety.searchText} like ${`%${q}%`}`)))
    .orderBy(sql`${vScore} desc`).limit(limit);
  const hits: PlantSearchHit[] = [
    ...speciesRows.map((r) => ({ kind: 'species' as const, id: r.id, name: r.names.fr[0] ?? r.latinName, latinName: r.latinName, familyCode: r.familyCode, spriteKey: r.spriteKey, score: Number(r.score) })),
    ...varietyRows.map((r) => ({ kind: 'variety' as const, id: r.id, speciesId: r.speciesId, name: r.name, speciesName: r.speciesNames.fr[0] ?? '', status: r.status, spriteKey: r.spriteKey, score: Number(r.score) })),
  ];
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function listSpecies(tx: Executor, opts: { familyCode?: string | undefined } = {}) {
  return tx.select({
    id: species.id, latinName: species.latinName, names: species.commonNames, familyCode: botanicalFamily.code, spriteKey: species.spriteKey,
    visualModel: species.visualModel, perennial: species.perennial,
  }).from(species).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .where(opts.familyCode ? eq(botanicalFamily.code, opts.familyCode) : undefined)
    .orderBy(sql`${species.commonNames}->'fr'->>0`);
}

export async function listFamilies(tx: Executor) {
  return tx.select().from(botanicalFamily).orderBy(asc(botanicalFamily.code));
}

/** Fiche espèce : besoins, variétés visibles, associations, calendrier indicatif (PAGES.md §5). */
export async function speciesDetail(tx: Executor, userId: string, speciesId: string) {
  const [s] = await tx.select({ sp: species, family: botanicalFamily }).from(species)
    .innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId)).where(eq(species.id, speciesId)).limit(1);
  if (!s) throw notFound();
  const varieties = await tx.select().from(variety)
    .where(and(eq(variety.speciesId, speciesId), visibleVariety(userId))).orderBy(asc(variety.name));
  const rows = await tx.select().from(companion).where(or(eq(companion.speciesAId, speciesId), eq(companion.speciesBId, speciesId)));
  const links = companionsOf(rows, speciesId);
  const others = links.length === 0 ? [] : await tx.select({ id: species.id, names: species.commonNames, spriteKey: species.spriteKey }).from(species)
    .where(inArray(species.id, links.map((l) => l.speciesId)));
  const byId = new Map(others.map((o) => [o.id, o]));
  const calendars = await tx.select().from(speciesCalendar).where(eq(speciesCalendar.speciesId, speciesId));
  return {
    ...s.sp,
    family: s.family,
    varieties,
    companions: links.flatMap((l) => {
      const o = byId.get(l.speciesId);
      return o ? [{ id: o.id, name: o.names.fr[0] ?? '', spriteKey: o.spriteKey, effect: l.effect }] : [];
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    calendars,
  };
}

/** Variétés utilisables pour une espèce dans un jardin (formulaire de culture). */
export async function varietiesForGarden(tx: Executor, speciesId: string, gardenId: string) {
  return tx.select({ id: variety.id, name: variety.name, status: variety.status }).from(variety)
    .where(and(eq(variety.speciesId, speciesId), or(eq(variety.status, 'approved'), and(inArray(variety.status, ['pending', 'rejected']), eq(variety.proposedGardenId, gardenId)))))
    .orderBy(asc(variety.name));
}

/** RG-PLT-02 : proposition de variété, utilisable tout de suite dans le jardin du proposant. */
export async function proposeVariety(ctx: ServiceCtx, input: VarietyProposeInput) {
  const { tx, actor, clock } = ctx;
  if (!actor.emailVerified) throw forbidden('emailNotVerified');
  const [m] = await tx.select({ id: gardenMember.id }).from(gardenMember)
    .where(and(eq(gardenMember.gardenId, input.gardenId), eq(gardenMember.userId, actor.id), isNull(gardenMember.leftAt), ne(gardenMember.role, 'observer'))).limit(1);
  if (!m) throw forbidden('notMember');
  const [sp] = await tx.select({ names: species.commonNames }).from(species).where(eq(species.id, input.speciesId)).limit(1);
  if (!sp) throw notFound();
  const [v] = await tx.insert(variety).values({
    speciesId: input.speciesId, name: input.name, origin: input.origin, description: input.description ?? null, status: 'pending',
    proposedBy: actor.id, proposedGardenId: input.gardenId, searchText: normalizeSearch(`${input.name} ${sp.names.fr.join(' ')}`),
  }).returning({ id: variety.id });
  if (!v) throw new Error('Insertion de la variété échouée');
  await emit(tx, { type: 'variety.proposed', subjectType: 'variety', subjectId: v.id, gardenId: input.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { varietyId: v.id };
}

export function assertModerator(actor: ServiceCtx['actor']) {
  if (actor.platformRole !== 'moderator' && actor.platformRole !== 'admin') throw forbidden();
}

/** RG-PLT-03 : approbation, refus ou fusion (les cultures sont repointées dans la transaction). */
export async function moderateVariety(ctx: ServiceCtx, input: VarietyModerateInput) {
  const { tx, actor, clock } = ctx;
  assertModerator(actor);
  const [v] = await tx.select().from(variety).where(eq(variety.id, input.varietyId)).limit(1);
  if (!v || v.status === 'merged') throw notFound();
  const base = { moderatedBy: actor.id, moderatedAt: clock.now(), moderationNote: input.note ?? null };
  if (input.decision === 'merge') {
    const [target] = await tx.select().from(variety).where(eq(variety.id, input.targetId)).limit(1);
    if (!target || target.id === v.id || target.status !== 'approved' || target.speciesId !== v.speciesId) throw new DomainError('VALIDATION', 'validation', { targetId: ['invalidMergeTarget'] });
    await tx.update(culture).set({ varietyId: target.id }).where(eq(culture.varietyId, v.id));
    await tx.update(variety).set({ ...base, status: 'merged', mergedIntoId: target.id }).where(eq(variety.id, v.id));
  } else {
    await tx.update(variety).set({ ...base, status: input.decision === 'approve' ? 'approved' : 'rejected' }).where(eq(variety.id, v.id));
  }
  await emit(tx, { type: input.decision === 'approve' ? 'variety.approved' : input.decision === 'reject' ? 'variety.rejected' : 'variety.merged', subjectType: 'variety', subjectId: v.id, gardenId: v.proposedGardenId, actorId: actor.id, payload: { proposedBy: v.proposedBy } }, clock.now());
  return { varietyId: v.id };
}

export async function pendingVarieties(tx: Executor) {
  return tx.select({ v: variety, speciesNames: species.commonNames }).from(variety).innerJoin(species, eq(species.id, variety.speciesId))
    .where(eq(variety.status, 'pending')).orderBy(asc(variety.createdAt));
}
