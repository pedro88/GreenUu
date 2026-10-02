import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Environment, Method, Stage } from '@/lib/enums';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { culture, cultureResult, guide, guideVersion, sharedResultFact, species, speciesCalendar, variety } from '@/server/db/schema';
import { zoneWarningsBatch } from '../culture/service';
import { anchorStage } from '../culture/stages.pure';
import { gardenContext } from '../tip/service';
import type { Context } from './context.pure';
import { gardenPseudo } from './facts';
import {
  adjust, adjustedWindow, COLD_START_GARDENS, ENGINE_VERSION, type Fact, outcome, partitionOwn, percentileRank, scoreGroup, shiftDoy, similarity,
  type Confidence,
} from './score.pure';
import { decodeGeohash } from '@/lib/geohash';

/** SPEC §7.1 : l'UI ne dépend que de cette interface ; une implémentation future la remplacera sans toucher à l'UI. */
export type Warning = 'rotation' | 'unfavorable_companion' | 'out_of_window' | 'environment_mismatch';
export type Explanation = {
  source: 'community' | 'reference' | 'guide' | 'own_history';
  confidence: Confidence;
  gardensCount: number;
  resultsCount: number;
  meanSuccessPct?: number;
  medianYieldKgM2?: number;
  topProblems?: { code: string; sharePct: number }[];
  contextSummary: { koppen: string | null; environment: Environment | null; altitudeM: number | null; practices: string[] };
  ownHistory?: { seasons: number; meanRating: number };
  warnings: Warning[];
};
export type DoyWindow = { start: number; optimum?: number; end: number };
export type VarietyRecommendation = { speciesId: string; varietyId?: string; speciesName: string; varietyName?: string; score: number; window?: DoyWindow; bestMethod?: Method; explanation: Explanation; guideId?: string };
export type CalendarRecommendation = { reference: DoyWindow | null; adjusted: DoyWindow | null; offsetDays: number | null; gardensCount: number; label: 'community' | 'reference' };
export type MethodRecommendation = { method: Method; score: number; confidence: Confidence; gardensCount: number };
export type VarietyQuery = { gardenId: string; zoneId: string; from: Date; to: Date; speciesId?: string; limit?: number };

export interface RecommendationEngine {
  readonly version: string;
  recommendVarieties(q: VarietyQuery, scope: Scope): Promise<VarietyRecommendation[]>;
  adjustedCalendar(q: { zoneId: string; speciesId: string; varietyId?: string; method?: Method }, scope: Scope): Promise<CalendarRecommendation>;
  compareMethods(q: { zoneId: string; speciesId: string }, scope: Scope): Promise<MethodRecommendation[]>;
}

type Similar = Fact & { s: number; environment: Environment | null };

/** Faits candidats lus par appel, après les filtres durs ; au-delà, les plus récents sont gardés et un avertissement est journalisé. */
export const FACT_SCAN_LIMIT = 20_000;
const SOILLESS: Environment[] = ['indoor', 'soilless', 'hydroponic'];

const doyOf = (d: Date) => Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
const inWindow = (from: number, to: number, w: { start: number; end: number }) => (w.start <= w.end ? from <= w.end && to >= w.start : from <= w.end || to >= w.start);

/** Implémentation V1 (§7.3 à 7.5) : SQL pour lire les faits, fonctions pures pour décider. */
export function createEngineV1(tx: Executor): RecommendationEngine {
  /** Contexte effectif de la zone : celui du jardin, avec l'environnement de la zone ou de son ancêtre le plus proche. */
  async function zoneContext(scope: Scope, zoneId: string): Promise<Context & { environment: Environment | null; lat: number | null }> {
    const g = await gardenContext(tx, scope.gardenId);
    const rows = await tx.execute<{ environment: Environment | null }>(sql`
      select coalesce(z.environment, (select a.environment from zone a where a.garden_id = z.garden_id and a.environment is not null and a.id::text = any (string_to_array(z.path, '/')) order by a.depth desc limit 1)) as environment
      from zone z where z.id = ${zoneId} and z.garden_id = ${scope.gardenId}`);
    const zoneEnv = [...rows][0]?.environment ?? null;
    return { ...g, environment: zoneEnv ?? g.environment, lat: g.geohash4 ? decodeGeohash(g.geohash4).lat : null };
  }

  /** Faits similaires (hors jardin courant), avec le rang de rendement par espèce et environnement. */
  async function similarFacts(scope: Scope, target: Context, speciesId?: string) {
    // Filtres durs en SQL (§7.2) : environnement comparable et même hémisphère (bit de latitude du 1er caractère du geohash).
    const north = target.geohash4 ? decodeGeohash(target.geohash4).lat >= 0 : null;
    const rows = await tx.select().from(sharedResultFact).where(and(
      speciesId ? eq(sharedResultFact.speciesId, speciesId) : undefined,
      target.environment === 'open_air' ? sql`(${sharedResultFact.environment} is null or ${sharedResultFact.environment} <> all (array['indoor', 'soilless', 'hydroponic']))` : undefined,
      target.environment && SOILLESS.includes(target.environment) ? sql`${sharedResultFact.environment} is distinct from 'open_air'` : undefined,
      north === null ? undefined : sql`((strpos('0123456789bcdefghjkmnpqrstuvwxyz', left(${sharedResultFact.geohash4}, 1)) - 1) & 8 <> 0) = ${north}`,
    )).orderBy(desc(sharedResultFact.year), asc(sharedResultFact.factId)).limit(FACT_SCAN_LIMIT + 1);
    // Borne explicite et signalée : jamais de troncature muette (audit lot 5 M2).
    if (rows.length > FACT_SCAN_LIMIT) {
      console.warn(`[reco] plus de ${FACT_SCAN_LIMIT} faits candidats : les plus récents sont retenus`);
      rows.length = FACT_SCAN_LIMIT;
    }
    const facts: Fact[] = rows.map((r) => ({ ...r, soilPh: r.soilPhHalf, altitudeM: r.altitude100, yieldKgM2: r.yieldKgM2 === null ? null : Number(r.yieldKgM2) }));
    const { community } = partitionOwn(facts, await gardenPseudo(tx, scope.gardenId));
    const yields = new Map<string, number[]>();
    for (const f of community) if (f.yieldKgM2 !== null) yields.set(`${f.speciesId}|${f.environment ?? ''}`, [...(yields.get(`${f.speciesId}|${f.environment ?? ''}`) ?? []), f.yieldKgM2]);
    const pYieldOf = (f: Fact) => (f.yieldKgM2 === null ? null : percentileRank(f.yieldKgM2, yields.get(`${f.speciesId}|${f.environment ?? ''}`) ?? []));
    const similar: Similar[] = community.flatMap((f) => {
      const s = similarity(target, f);
      return s === null ? [] : [{ ...f, environment: f.environment ?? null, s }];
    });
    return { similar, pYieldOf };
  }

  /**
   * Historique propre du jardin courant (§7.3 point 6) en une requête : par variété pour un groupe de variété,
   * et toutes variétés confondues pour un groupe d'espèce (clé `espèce|`).
   */
  async function ownHistories(scope: Scope) {
    const rows = await tx.select({ speciesId: culture.speciesId, varietyId: culture.varietyId, seasonId: cultureResult.seasonId, rating: cultureResult.rating })
      .from(cultureResult).innerJoin(culture, eq(culture.id, cultureResult.cultureId))
      .where(and(eq(cultureResult.gardenId, scope.gardenId), isNull(culture.deletedAt)));
    const acc = new Map<string, { seasons: Set<string>; ratings: number[] }>();
    const add = (key: string, r: (typeof rows)[number]) => {
      const a = acc.get(key) ?? { seasons: new Set<string>(), ratings: [] };
      a.seasons.add(r.seasonId);
      if (r.rating !== null) a.ratings.push(r.rating);
      acc.set(key, a);
    };
    for (const r of rows) {
      add(`${r.speciesId}|`, r);
      if (r.varietyId) add(`${r.speciesId}|${r.varietyId}`, r);
    }
    const out = new Map<string, { seasons: number; meanRating: number }>();
    for (const [k, a] of acc) if (a.ratings.length) out.set(k, { seasons: a.seasons.size, meanRating: Math.round((a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length) * 10) / 10 });
    return out;
  }

  async function referenceWindow(speciesId: string, target: Context, stages: Stage[]): Promise<DoyWindow | null> {
    const group = target.koppen?.[0] ?? null;
    const [w] = await tx.select({ start: speciesCalendar.windowStartDoy, end: speciesCalendar.windowEndDoy }).from(speciesCalendar)
      .where(and(eq(speciesCalendar.speciesId, speciesId), group ? eq(speciesCalendar.koppenGroup, group) : undefined, inArray(speciesCalendar.stage, stages),
        target.environment ? eq(speciesCalendar.environment, target.environment) : undefined))
      .orderBy(asc(speciesCalendar.windowStartDoy)).limit(1);
    return w ?? null;
  }

  /** §7.5 : guide public de l'espèce au contexte proche (même groupe Köppen, même environnement), le plus appliqué. */
  async function matchingGuide(speciesId: string, target: Context) {
    const group = target.koppen?.[0] ?? '';
    const [gd] = await tx.select({ id: guide.id, applications: sql<number>`(select count(*) from ${culture} where ${culture.appliedGuideVersionId} in (select id from guide_version where guide_id = ${guide.id}))::int` })
      .from(guide).innerJoin(guideVersion, eq(guideVersion.id, guide.currentVersionId))
      .where(and(eq(guide.speciesId, speciesId), eq(guide.visibility, 'public'), eq(guide.hiddenByModeration, false), isNull(guide.deletedAt),
        sql`exists (select 1 from jsonb_array_elements_text(coalesce(${guideVersion.context}->'koppen', '[]'::jsonb)) k where left(k, 1) = ${group})`,
        target.environment ? sql`coalesce(${guideVersion.context}->'environments', '[]'::jsonb) ? ${target.environment}` : undefined))
      .orderBy(desc(sql`2`)).limit(1);
    return gd ?? null;
  }

  async function names(ids: { speciesId: string; varietyId: string | null }[]) {
    const sp = ids.length ? await tx.select({ id: species.id, name: sql<string>`${species.commonNames}->'fr'->>0`, model: species.visualModel }).from(species).where(inArray(species.id, [...new Set(ids.map((i) => i.speciesId))])) : [];
    const vIds = [...new Set(ids.flatMap((i) => (i.varietyId ? [i.varietyId] : [])))];
    const vs = vIds.length ? await tx.select({ id: variety.id, name: variety.name }).from(variety).where(inArray(variety.id, vIds)) : [];
    return { sp: new Map(sp.map((x) => [x.id, x])), v: new Map(vs.map((x) => [x.id, x.name])) };
  }

  /** §7.5 : démarrage à froid, guide public au contexte proche, sinon référentiel ; le bandeau cite n sur 5. */
async function coldStart(q: VarietyQuery, target: Context, facts: Similar[]): Promise<VarietyRecommendation> {
    const speciesId = q.speciesId ?? '';
    const n = await names([{ speciesId, varietyId: null }]);
    const gd = await matchingGuide(speciesId, target);
    const ref = await referenceWindow(speciesId, target, ['sowing', 'planting']);
    return {
      speciesId, speciesName: n.sp.get(speciesId)?.name ?? '', score: 0, ...(ref ? { window: ref } : {}), ...(gd ? { guideId: gd.id } : {}),
      explanation: {
        source: gd ? 'guide' : 'reference', confidence: 'cold_start', gardensCount: new Set(facts.map((f) => f.gardenPseudo)).size, resultsCount: facts.length,
        contextSummary: summary(target), warnings: [],
      },
    };
  }

  const summary = (t: Context): Explanation['contextSummary'] => ({ koppen: t.koppen ?? null, environment: t.environment ?? null, altitudeM: t.altitudeM ?? null, practices: t.practices ?? [] });

  return {
    version: ENGINE_VERSION,

    async recommendVarieties(q, scope) {
      const target = await zoneContext(scope, q.zoneId);
      const { similar, pYieldOf } = await similarFacts(scope, target, q.speciesId);
      const fromDoy = doyOf(q.from);
      const toDoy = doyOf(q.to);
      const bySpecies = new Map<string, Similar[]>();
      for (const f of similar) bySpecies.set(f.speciesId, [...(bySpecies.get(f.speciesId) ?? []), f]);
      const groups = new Map<string, Similar[]>();
      for (const f of similar) groups.set(`${f.speciesId}|${f.varietyId ?? ''}`, [...(groups.get(`${f.speciesId}|${f.varietyId ?? ''}`) ?? []), f]);
      const n = await names([...groups.values()].map((g) => ({ speciesId: g[0]?.speciesId ?? '', varietyId: g[0]?.varietyId ?? null })));
      const methodOf = (facts: Similar[]) => {
        const methods = new Map<Method, number>();
        for (const f of facts) methods.set(f.method, (methods.get(f.method) ?? 0) + 1);
        return [...methods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      };
      // Rotation et associations calculées une fois pour toutes les espèces candidates (au lieu d'un aperçu par groupe).
      const warningsOf = await zoneWarningsBatch(tx, scope, q.zoneId, [...groups.values()].flatMap((g) => (g[0] ? [{ speciesId: g[0].speciesId, method: methodOf(g) ?? 'bought_plants' }] : [])), q.from.toISOString().slice(0, 10));
      const owns = await ownHistories(scope);
      const refs = new Map<string, DoyWindow | null>();
      const out: VarietyRecommendation[] = [];
      for (const facts of groups.values()) {
        const first = facts[0];
        if (!first) continue;
        const speciesFacts = bySpecies.get(first.speciesId) ?? [];
        const outcomes = speciesFacts.flatMap((f) => { const o = outcome(f, pYieldOf(f)); return o === null ? [] : [o]; });
        const prior = outcomes.length ? outcomes.reduce((a, b) => a + b, 0) / outcomes.length : 0.6;
        const g = scoreGroup(facts, prior, pYieldOf);
        if (g.confidence === 'cold_start') continue;
        const bestMethod = methodOf(facts);
        const spInfo = n.sp.get(first.speciesId);
        const stage = anchorStage(bestMethod ?? 'bought_plants');
        const refKey = `${first.speciesId}|${stage}`;
        if (!refs.has(refKey)) refs.set(refKey, await referenceWindow(first.speciesId, target, [stage]));
        const ref = refs.get(refKey) ?? null;
        const warnings: Warning[] = [];
        if (ref) {
          const w = { start: shiftDoy(ref.start, (target.lat ?? 0) < 0), end: shiftDoy(ref.end, (target.lat ?? 0) < 0) };
          if (!inWindow(fromDoy, toDoy, w)) {
            if (!q.speciesId) continue;
            warnings.push('out_of_window');
          }
        }
        const zw = warningsOf.get(`${first.speciesId}|${bestMethod ?? 'bought_plants'}`);
        const rotation = zw?.rotation ?? false;
        const unfavorable = zw?.unfavorable ?? false;
        if (rotation) warnings.push('rotation');
        if (unfavorable) warnings.push('unfavorable_companion');
        const own = owns.get(`${first.speciesId}|${first.varietyId ?? ''}`);
        out.push({
          speciesId: first.speciesId, ...(first.varietyId ? { varietyId: first.varietyId, varietyName: n.v.get(first.varietyId) ?? '' } : {}), speciesName: spInfo?.name ?? '',
          score: adjust(g.score, { rotation, unfavorableCompanion: unfavorable }), ...(ref ? { window: ref } : {}), ...(bestMethod ? { bestMethod } : {}),
          explanation: {
            source: 'community', confidence: g.confidence, gardensCount: g.gardensCount, resultsCount: g.resultsCount,
            ...(g.meanSuccessPct !== null ? { meanSuccessPct: g.meanSuccessPct } : {}), ...(g.medianYieldKgM2 !== null ? { medianYieldKgM2: Math.round(g.medianYieldKgM2 * 10) / 10 } : {}),
            topProblems: g.topProblems, contextSummary: summary(target), ...(own ? { ownHistory: own } : {}), warnings,
          },
        });
      }
      const rank: Record<Confidence, number> = { high: 0, medium: 1, low: 2, cold_start: 3 };
      out.sort((a, b) => b.score - a.score || rank[a.explanation.confidence] - rank[b.explanation.confidence]);
      if (q.speciesId && !out.some((r) => r.speciesId === q.speciesId)) out.push(await coldStart(q, target, bySpecies.get(q.speciesId) ?? []));
      return out.slice(0, q.limit ?? 10);
    },

    async adjustedCalendar(q, scope) {
      const target = await zoneContext(scope, q.zoneId);
      const method = q.method ?? 'bought_plants';
      const stage = anchorStage(method);
      const ref = await referenceWindow(q.speciesId, target, [stage]);
      const { similar, pYieldOf } = await similarFacts(scope, target, q.speciesId);
      const facts = similar.filter((f) => !q.varietyId || f.varietyId === q.varietyId);
      const points = facts.flatMap((f) => {
        const doy = stage === 'sowing' ? f.sowingDoy : f.plantingDoy;
        const o = outcome(f, pYieldOf(f));
        return doy == null || o === null ? [] : [{ doy, weight: f.s, outcome: o, garden: f.gardenPseudo }];
      });
      const gardens = new Set(points.map((p) => p.garden)).size;
      const adjusted = gardens >= COLD_START_GARDENS ? adjustedWindow(points) : null;
      const offsetDays = adjusted && ref ? adjusted.optimum - Math.round((ref.start + ref.end) / 2) : null;
      return { reference: ref, adjusted, offsetDays, gardensCount: gardens, label: adjusted ? 'community' : 'reference' };
    },

    async compareMethods(q, scope) {
      const target = await zoneContext(scope, q.zoneId);
      const { similar, pYieldOf } = await similarFacts(scope, target, q.speciesId);
      const byMethod = new Map<Method, Similar[]>();
      for (const f of similar) byMethod.set(f.method, [...(byMethod.get(f.method) ?? []), f]);
      return [...byMethod.entries()].map(([method, facts]) => {
        const g = scoreGroup(facts, 0.6, pYieldOf);
        return { method, score: g.score, confidence: g.confidence, gardensCount: g.gardensCount };
      }).sort((a, b) => b.score - a.score);
    }
  };
}
