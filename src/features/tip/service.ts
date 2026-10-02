import { and, asc, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';
import { forbidden, notFound } from '@/lib/errors';
import type { Environment } from '@/lib/enums';
import type { ServiceCtx } from '@/server/action-core';
import { loadScope } from '@/server/authz/scope';
import type { Viewer } from '@/server/authz/content';
import type { Executor } from '@/server/db/client';
import { garden, gardenEnvironment, gardenMember, practice, practiceDeclaration, species, tag, tip, tipTag, tipVote, userProfile } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { contextDistance, type Context } from '../reco/context.pure';
import { feedScore } from './rules.pure';
import type { TipCreateInput } from './schema';

export const TIP_FEED_LIMIT = 50;
const FEED_CANDIDATES = 300;

/** Contexte d'un jardin pour les tips et le fil : jamais la localisation précise (geohash4 seulement, GRD-03). */
export async function gardenContext(tx: Executor, gardenId: string): Promise<Context & { environment: Environment | null }> {
  const [g] = await tx.select({ koppen: garden.koppen, geohash4: garden.geohash4, altitudeM: garden.altitudeM, hardinessZone: garden.hardinessZone, soilType: garden.soilType, soilPh: garden.soilPh })
    .from(garden).where(eq(garden.id, gardenId)).limit(1);
  const [env] = await tx.select({ environment: gardenEnvironment.environment }).from(gardenEnvironment).where(eq(gardenEnvironment.gardenId, gardenId)).orderBy(asc(gardenEnvironment.position)).limit(1);
  // Pratiques déclarées au niveau du jardin (sans zone ni saison), hors exclusions.
  const practices = await tx.select({ code: practice.code }).from(practiceDeclaration).innerJoin(practice, eq(practice.id, practiceDeclaration.practiceId))
    .where(and(eq(practiceDeclaration.gardenId, gardenId), isNull(practiceDeclaration.zoneId), isNull(practiceDeclaration.seasonId), eq(practiceDeclaration.excluded, false)));
  return { ...g, environment: env?.environment ?? null, practices: practices.map((p) => p.code) };
}

/** Tags existants ou créés, dans l'ordre donné (RG-TIP-01). */
async function upsertTags(tx: Executor, slugs: string[]) {
  await tx.insert(tag).values(slugs.map((slug) => ({ slug }))).onConflictDoNothing();
  return tx.select({ id: tag.id, slug: tag.slug }).from(tag).where(inArray(tag.slug, slugs));
}

/** RG-TIP-01 : tip de 10 à 500 caractères, 1 à 5 tags, contexte du jardin courant (retirable). */
export async function createTip(ctx: ServiceCtx, input: TipCreateInput) {
  const { tx, actor, clock } = ctx;
  if (!actor.emailVerified) throw forbidden('emailNotVerified');
  let context: { geohash4: string | null; koppen: string | null; environment: Environment | null } = { geohash4: null, koppen: null, environment: null };
  if (input.contextGardenId) {
    const scope = await loadScope(tx, actor.id, input.contextGardenId);
    if (!scope) throw forbidden();
    const c = await gardenContext(tx, input.contextGardenId);
    context = { geohash4: c.geohash4 ?? null, koppen: c.koppen ?? null, environment: c.environment };
  }
  if (input.speciesId) {
    const [sp] = await tx.select({ id: species.id }).from(species).where(eq(species.id, input.speciesId)).limit(1);
    if (!sp) throw notFound();
  }
  const [t] = await tx.insert(tip).values({ authorId: actor.id, speciesId: input.speciesId ?? null, body: input.body, ...context }).returning({ id: tip.id });
  if (!t) throw new Error('Insertion du tip échouée');
  const tags = await upsertTags(tx, input.tags);
  await tx.insert(tipTag).values(tags.map((x) => ({ tipId: t.id, tagId: x.id })));
  await emit(tx, { type: 'tip.created', subjectType: 'tip', subjectId: t.id, gardenId: null, actorId: actor.id, payload: { tags: input.tags } }, clock.now());
  return { tipId: t.id };
}

/** Trois suggestions de tags existants, par préfixe puis popularité (RG-TIP-01). */
export async function suggestTags(tx: Executor, prefix: string, exclude: string[]) {
  const used = sql<number>`(select count(*) from ${tipTag} where ${tipTag.tagId} = ${tag.id})`;
  return (await tx.select({ slug: tag.slug }).from(tag).where(prefix ? like(tag.slug, `${prefix}%`) : undefined).orderBy(desc(used), asc(tag.slug)).limit(3 + exclude.length))
    .map((r) => r.slug).filter((s) => !exclude.includes(s)).slice(0, 3);
}

/** RG-TIP-02 : un vote par personne (+1, −1, 0 pour retirer), jamais sur son propre tip (TIP-03, TIP-04). */
export async function voteTip(ctx: ServiceCtx, tipId: string, value: 1 | -1 | 0) {
  const { tx, actor, clock } = ctx;
  if (!actor.emailVerified) throw forbidden('emailNotVerified');
  const [t] = await tx.select({ id: tip.id, authorId: tip.authorId }).from(tip).where(and(eq(tip.id, tipId), isNull(tip.deletedAt), eq(tip.hiddenByModeration, false))).limit(1);
  if (!t) throw notFound();
  if (t.authorId === actor.id) throw forbidden('ownTip');
  const [prev] = await tx.select({ value: tipVote.value }).from(tipVote).where(and(eq(tipVote.tipId, t.id), eq(tipVote.userId, actor.id))).limit(1);
  if (value === 0) await tx.delete(tipVote).where(and(eq(tipVote.tipId, t.id), eq(tipVote.userId, actor.id)));
  else await tx.insert(tipVote).values({ tipId: t.id, userId: actor.id, value }).onConflictDoUpdate({ target: [tipVote.tipId, tipVote.userId], set: { value } });
  // Compteurs recalculés depuis les votes : jamais de dérive par incréments concurrents.
  await tx.update(tip).set({
    usefulCount: sql`(select count(*) from ${tipVote} where ${tipVote.tipId} = ${t.id} and ${tipVote.value} = 1)`,
    notUsefulCount: sql`(select count(*) from ${tipVote} where ${tipVote.tipId} = ${t.id} and ${tipVote.value} = -1)`,
  }).where(eq(tip.id, t.id));
  if ((prev?.value ?? 0) !== value) {
    await emit(tx, { type: 'tip.voted', subjectType: 'tip', subjectId: t.id, gardenId: null, actorId: actor.id, payload: { value, previous: prev?.value ?? 0, voterId: actor.id, authorId: t.authorId } }, clock.now());
  }
  const [counts] = await tx.select({ useful: tip.usefulCount, notUseful: tip.notUsefulCount }).from(tip).where(eq(tip.id, t.id));
  return { tipId: t.id, value, useful: counts?.useful ?? 0, notUseful: counts?.notUseful ?? 0 };
}

export type TipFilters = { tag?: string | undefined; speciesId?: string | undefined; environment?: string | undefined; authorId?: string | undefined };

/**
 * RG-TIP-03 : fil classé par Wilson pondéré par la proximité du contexte avec le jardin courant.
 * Les candidats (les plus récents, bornés) sont classés en mémoire : le score dépend du lecteur.
 */
export async function tipFeed(tx: Executor, viewer: Viewer, f: TipFilters, context: Context | null, limit = TIP_FEED_LIMIT) {
  const rows = await tx.select({
    id: tip.id, body: tip.body, authorId: tip.authorId, authorPseudo: userProfile.pseudo, speciesId: tip.speciesId, geohash4: tip.geohash4, koppen: tip.koppen,
    environment: tip.environment, useful: tip.usefulCount, notUseful: tip.notUsefulCount, createdAt: tip.createdAt,
  }).from(tip).leftJoin(userProfile, eq(userProfile.userId, tip.authorId)).where(and(
    isNull(tip.deletedAt), eq(tip.hiddenByModeration, false),
    f.speciesId ? eq(tip.speciesId, f.speciesId) : undefined,
    f.authorId ? eq(tip.authorId, f.authorId) : undefined,
    f.environment ? sql`${tip.environment} = ${f.environment}` : undefined,
    f.tag ? sql`exists (select 1 from ${tipTag} join ${tag} on ${tag.id} = ${tipTag.tagId} where ${tipTag.tipId} = ${tip.id} and ${tag.slug} = ${f.tag})` : undefined,
  )).orderBy(desc(tip.createdAt)).limit(FEED_CANDIDATES);
  const ranked = rows.map((r) => ({ ...r, score: feedScore(r.useful, r.notUseful, context ? contextDistance(context, { koppen: r.koppen, environment: r.environment, geohash4: r.geohash4 }) : 0.5) }))
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  const ids = ranked.map((r) => r.id);
  const tagRows = ids.length ? await tx.select({ tipId: tipTag.tipId, slug: tag.slug }).from(tipTag).innerJoin(tag, eq(tag.id, tipTag.tagId)).where(inArray(tipTag.tipId, ids)) : [];
  const myVotes = ids.length && viewer ? await tx.select({ tipId: tipVote.tipId, value: tipVote.value }).from(tipVote).where(and(eq(tipVote.userId, viewer.id), inArray(tipVote.tipId, ids))) : [];
  return ranked.map((r) => ({ ...r, tags: tagRows.filter((t) => t.tipId === r.id).map((t) => t.slug), myVote: myVotes.find((v) => v.tipId === r.id)?.value ?? 0 }));
}

/** Jardins de l'utilisateur, pour choisir le contexte du fil et des nouveaux tips. */
export async function myGardensForContext(tx: Executor, userId: string) {
  return tx.select({ id: garden.id, name: garden.name }).from(gardenMember).innerJoin(garden, eq(garden.id, gardenMember.gardenId))
    .where(and(eq(gardenMember.userId, userId), isNull(gardenMember.leftAt), isNull(garden.deletedAt))).orderBy(asc(garden.name));
}
