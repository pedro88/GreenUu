import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { notFound } from '@/lib/errors';
import { normalizeSearch } from '@/lib/text';
import { canReadGuide, type GuideFacts, type Viewer } from '@/server/authz/content';
import type { Executor } from '@/server/db/client';
import { culture, garden, gardenMember, guide, guideVersion, species, userProfile, variety } from '@/server/db/schema';
import { lineDiff, prettyJson } from './rules.pure';
import type { z } from '@/lib/zod';
import type { guideFiltersSchema } from './schema';

export const GUIDE_LIST_LIMIT = 50;

export async function loadGuide(tx: Executor, guideId: string) {
  const [g] = await tx.select().from(guide).where(eq(guide.id, guideId)).limit(1);
  if (!g) throw notFound('guideNotFound');
  return g;
}

async function isActiveMember(tx: Executor, userId: string, gardenId: string) {
  const [m] = await tx.select({ id: gardenMember.id }).from(gardenMember)
    .innerJoin(garden, eq(garden.id, gardenMember.gardenId))
    .where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.userId, userId), isNull(gardenMember.leftAt), isNull(garden.deletedAt))).limit(1);
  return m !== undefined;
}

export async function guideFacts(tx: Executor, viewer: Viewer, g: typeof guide.$inferSelect): Promise<GuideFacts> {
  return {
    authorId: g.authorId, visibility: g.visibility, published: g.currentVersionId !== null, hidden: g.hiddenByModeration, deleted: g.deletedAt !== null,
    viewerIsGardenMember: viewer !== null && g.gardenId !== null && await isActiveMember(tx, viewer.id, g.gardenId),
  };
}

/** Garde de lecture : un guide illisible est un 404, jamais un 403 qui en révélerait l'existence (GUI-04). */
export async function readableGuide(tx: Executor, viewer: Viewer, guideId: string) {
  const g = await loadGuide(tx, guideId);
  if (!canReadGuide(viewer, await guideFacts(tx, viewer, g))) throw notFound('guideNotFound');
  return g;
}

const speciesName = sql<string>`${species.commonNames}->'fr'->>0`;

/** Fiche d'un guide : version courante (ou brouillon pour l'auteur), auteur, origine du fork, compteurs. */
export async function guideDetail(tx: Executor, viewer: Viewer, guideId: string) {
  const g = await readableGuide(tx, viewer, guideId);
  const [v] = g.currentVersionId ? await tx.select().from(guideVersion).where(eq(guideVersion.id, g.currentVersionId)).limit(1) : [];
  const [author] = await tx.select({ pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, g.authorId)).limit(1);
  const [sp] = await tx.select({ name: speciesName, varietyName: variety.name }).from(species)
    .leftJoin(variety, and(eq(variety.id, sql`${g.varietyId}`), eq(variety.speciesId, species.id))).where(eq(species.id, g.speciesId)).limit(1);
  const origin = g.forkedFromVersionId ? await forkOrigin(tx, viewer, g.forkedFromVersionId) : null;
  const [usage] = await tx.select({ n: sql<number>`count(distinct ${culture.gardenId})::int` }).from(culture)
    .innerJoin(guideVersion, eq(guideVersion.id, culture.appliedGuideVersionId)).where(and(eq(guideVersion.guideId, g.id), isNull(culture.deletedAt)));
  return {
    guide: g, version: v ?? null, authorPseudo: author?.pseudo ?? '', speciesName: sp?.name ?? '', varietyName: sp?.varietyName ?? null,
    origin, gardensUsing: usage?.n ?? 0, isAuthor: viewer?.id === g.authorId,
  };
}

/** « Adapté de … (version n) », ou « original devenu privé » si le lecteur ne peut plus le lire (RG-GUI-03). */
async function forkOrigin(tx: Executor, viewer: Viewer, versionId: string) {
  const [o] = await tx.select({ guideId: guide.id, number: guideVersion.number, title: guideVersion.title, slug: guide.slug }).from(guideVersion)
    .innerJoin(guide, eq(guide.id, guideVersion.guideId)).where(eq(guideVersion.id, versionId)).limit(1);
  if (!o) return null;
  const readable = canReadGuide(viewer, await guideFacts(tx, viewer, await loadGuide(tx, o.guideId)));
  return readable ? { ...o, readable } : { guideId: null, number: o.number, title: null, slug: null, readable };
}

/** Guide public ou non listé par son slug, pour la consultation sans compte (`/guides-publics/[slug]`). */
export async function publicGuideBySlug(tx: Executor, slug: string) {
  const [g] = await tx.select().from(guide).where(and(eq(guide.slug, slug), inArray(guide.visibility, ['public', 'unlisted']), isNotNull(guide.currentVersionId), eq(guide.hiddenByModeration, false), isNull(guide.deletedAt))).limit(1);
  if (!g) throw notFound('guideNotFound');
  return guideDetail(tx, null, g.id);
}

type GuideFilters = z.output<typeof guideFiltersSchema>;

const listColumns = {
  id: guide.id, slug: guide.slug, visibility: guide.visibility, speciesId: guide.speciesId, authorId: guide.authorId,
  title: guideVersion.title, number: guideVersion.number, publishedAt: guideVersion.publishedAt, context: guideVersion.context,
  speciesName, authorPseudo: userProfile.pseudo,
};

function filterConditions(f: GuideFilters) {
  return [
    f.espece ? eq(guide.speciesId, f.espece) : undefined,
    f.q ? or(ilike(guideVersion.title, `%${f.q}%`), sql`${species.searchText} like ${`%${normalizeSearch(f.q)}%`}`) : undefined,
    f.climat ? sql`${guideVersion.context}->'koppen' ? ${f.climat}` : undefined,
    f.env ? sql`${guideVersion.context}->'environments' ? ${f.env}` : undefined,
  ];
}

/** Guides listés publiquement (RG-GUI-03) : les non listés n'apparaissent jamais dans une liste ni une recherche (GUI-05). */
export async function listPublicGuides(tx: Executor, f: GuideFilters) {
  return tx.select(listColumns).from(guide).innerJoin(guideVersion, eq(guideVersion.id, guide.currentVersionId))
    .innerJoin(species, eq(species.id, guide.speciesId)).leftJoin(userProfile, eq(userProfile.userId, guide.authorId))
    .where(and(eq(guide.visibility, 'public'), eq(guide.hiddenByModeration, false), isNull(guide.deletedAt), ...filterConditions(f)))
    .orderBy(desc(guideVersion.publishedAt)).limit(GUIDE_LIST_LIMIT);
}

/** Guides de la page `/app/guides` : publics, privés de mes jardins, et les miens (brouillons compris avec « mes guides »). */
export async function listGuidesFor(tx: Executor, viewer: NonNullable<Viewer>, f: GuideFilters) {
  const myGardens = tx.select({ id: gardenMember.gardenId }).from(gardenMember).where(and(eq(gardenMember.userId, viewer.id), isNull(gardenMember.leftAt)));
  const mine = eq(guide.authorId, viewer.id);
  const visible = f.mes ? mine : or(
    and(eq(guide.visibility, 'public'), isNotNull(guide.currentVersionId), eq(guide.hiddenByModeration, false)),
    and(eq(guide.visibility, 'private'), isNotNull(guide.currentVersionId), eq(guide.hiddenByModeration, false), inArray(guide.gardenId, myGardens)),
    and(mine, isNotNull(guide.currentVersionId)),
  );
  return tx.select({ ...listColumns, title: sql<string>`coalesce(${guideVersion.title}, ${guide.draft}->>'title')`, published: sql<boolean>`${guide.currentVersionId} is not null` })
    .from(guide).leftJoin(guideVersion, eq(guideVersion.id, guide.currentVersionId))
    .innerJoin(species, eq(species.id, guide.speciesId)).leftJoin(userProfile, eq(userProfile.userId, guide.authorId))
    .where(and(isNull(guide.deletedAt), visible, ...filterConditions(f)))
    .orderBy(desc(guide.updatedAt)).limit(GUIDE_LIST_LIMIT);
}

/** Guides applicables à une culture : lisibles, publiés, de la même espèce (privés : du même jardin). */
export async function guidesForSpecies(tx: Executor, viewer: NonNullable<Viewer>, speciesId: string, gardenId: string) {
  return tx.select({ id: guide.id, title: guideVersion.title, number: guideVersion.number, anchor: sql<string | null>`${guideVersion.calendarTemplate}->>'anchor'` })
    .from(guide).innerJoin(guideVersion, eq(guideVersion.id, guide.currentVersionId))
    .where(and(eq(guide.speciesId, speciesId), isNull(guide.deletedAt), eq(guide.hiddenByModeration, false), or(
      eq(guide.visibility, 'public'), eq(guide.authorId, viewer.id), and(eq(guide.visibility, 'private'), eq(guide.gardenId, gardenId)),
    ))).orderBy(asc(guideVersion.title)).limit(GUIDE_LIST_LIMIT);
}

export async function guideVersions(tx: Executor, viewer: Viewer, guideId: string) {
  const g = await readableGuide(tx, viewer, guideId);
  const versions = await tx.select({ id: guideVersion.id, number: guideVersion.number, changeNote: guideVersion.changeNote, publishedAt: guideVersion.publishedAt, title: guideVersion.title })
    .from(guideVersion).where(eq(guideVersion.guideId, g.id)).orderBy(desc(guideVersion.number));
  return { guide: g, versions };
}

/** RG-GUI-06 : diff du Markdown, du contexte et du calendrier entre deux versions d'un même guide. */
export async function compareVersions(tx: Executor, viewer: Viewer, guideId: string, from: number, to: number) {
  const g = await readableGuide(tx, viewer, guideId);
  const rows = await tx.select().from(guideVersion).where(and(eq(guideVersion.guideId, g.id), inArray(guideVersion.number, [from, to])));
  const a = rows.find((r) => r.number === from);
  const b = rows.find((r) => r.number === to);
  if (!a || !b) throw notFound('versionNotFound');
  return {
    from: a.number, to: b.number,
    body: lineDiff(`# ${a.title}\n\n${a.bodyMd}`, `# ${b.title}\n\n${b.bodyMd}`),
    context: lineDiff(prettyJson(a.context), prettyJson(b.context)),
    calendar: lineDiff(prettyJson(a.calendarTemplate), prettyJson(b.calendarTemplate)),
  };
}
