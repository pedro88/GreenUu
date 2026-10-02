import { eq, sql } from 'drizzle-orm';
import { encodeGeohash } from '../src/lib/geohash';
import { seedId } from '../src/lib/uuid5';
import { speciesRefId, varietyRefId } from '../src/features/plant/reference/load';
import { refreshSharedFacts } from '../src/features/reco/facts';
import type { Tx } from '../src/server/db/client';
import {
  culture, cultureResult, cultureResultProblem, cultureStage, garden, gardenEnvironment, gardenMember, practice, practiceDeclaration, problem, season, user,
  userProfile, zone, zoneType,
} from '../src/server/db/schema';
import type { Environment, Method, Stage } from '../src/lib/enums';

/**
 * Jardins « communauté » (SPEC §14) : 30 jardins synthétiques qui partagent leurs bilans, environ 600 bilans sur trois
 * saisons. Dans le contexte des Tilleuls (Cfb, plein air, 120 m), la tomate, la courgette, le haricot, la laitue,
 * l'oignon et la pomme de terre dépassent `high` ; le poireau reste `low` (6 jardins) ; la carotte reste en démarrage à froid (3 jardins).
 * Générateur à graine fixe (`mulberry32(42)`) : contenu identique pour une même date de référence.
 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Region = { koppen: string; lat: [number, number]; lng: [number, number]; alt: [number, number]; soils: string[]; shift: number };
const REGIONS: Record<'cfb' | 'csa' | 'dfb', Region> = {
  cfb: { koppen: 'Cfb', lat: [49.6, 51.3], lng: [2.6, 6.0], alt: [30, 280], soils: ['loam', 'silty', 'loam', 'clay'], shift: 0 },
  csa: { koppen: 'Csa', lat: [37.5, 43.4], lng: [-5.5, 4.5], alt: [0, 600], soils: ['chalky', 'sandy', 'loam'], shift: -25 },
  dfb: { koppen: 'Dfb', lat: [50.5, 54.0], lng: [12.0, 20.0], alt: [300, 1200], soils: ['sandy', 'stony', 'loam'], shift: 15 },
};

/** Espèce, variétés, méthode, étape d'ancrage et jour de l'année moyen en Cfb, rendement moyen en kg/m². */
type Crop = { code: string; varieties: string[]; method: Method; stage: Stage; doy: number; yieldKg: number; problems: string[] };
const COMMON: Crop[] = [
  { code: 'tomate', varieties: ['Cœur de bœuf', 'Marmande'], method: 'bought_plants', stage: 'planting', doy: 137, yieldKg: 3, problems: ['mildew', 'early_blight'] },
  { code: 'courgette', varieties: ['Verte des maraîchers'], method: 'bought_plants', stage: 'planting', doy: 140, yieldKg: 4, problems: ['powdery_mildew'] },
  { code: 'haricot', varieties: ['Contender'], method: 'direct_sowing', stage: 'sowing', doy: 140, yieldKg: 1.2, problems: ['slugs'] },
  { code: 'laitue', varieties: [], method: 'bought_plants', stage: 'planting', doy: 100, yieldKg: 2, problems: ['slugs'] },
  { code: 'oignon', varieties: [], method: 'bulb_tuber', stage: 'planting', doy: 80, yieldKg: 2.5, problems: [] },
  { code: 'pomme-de-terre', varieties: ['Charlotte'], method: 'bulb_tuber', stage: 'planting', doy: 105, yieldKg: 3.5, problems: ['colorado_beetle', 'mildew'] },
];
const LEEK: Crop = { code: 'poireau', varieties: ['Bleu de Solaise'], method: 'bought_plants', stage: 'planting', doy: 170, yieldKg: 2.5, problems: [] };
const CARROT: Crop = { code: 'carotte', varieties: [], method: 'direct_sowing', stage: 'sowing', doy: 95, yieldKg: 3, problems: ['carrot_fly'] };

const iso = (year: number, doy: number) => new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);

export async function seedCommunity(tx: Tx, ref: Date) {
  const [already] = await tx.select({ id: garden.id }).from(garden).where(eq(garden.id, seedId('garden:community:0'))).limit(1);
  if (already) return;
  const rnd = mulberry32(42);
  const between = ([a, b]: [number, number]) => a + rnd() * (b - a);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T; // as: tableau non vide par construction
  const year = ref.getUTCFullYear();
  const [bed] = await tx.select({ id: zoneType.id }).from(zoneType).where(sql`${zoneType.code} = 'bed' and ${zoneType.gardenId} is null`).limit(1);
  const problems = new Map((await tx.select({ id: problem.id, code: problem.code }).from(problem)).map((p) => [p.code, p.id]));
  const practices = new Map((await tx.select({ id: practice.id, code: practice.code }).from(practice)).map((p) => [p.code, p.id]));
  if (!bed) throw new Error('type de zone « bed » manquant');

  const plan: { region: keyof typeof REGIONS; extras: Crop[] }[] = [
    ...Array.from({ length: 18 }, (_, i) => ({ region: 'cfb' as const, extras: [...(i < 6 ? [LEEK] : []), ...(i < 3 ? [CARROT] : [])] })),
    ...Array.from({ length: 6 }, () => ({ region: 'csa' as const, extras: [] })),
    ...Array.from({ length: 6 }, () => ({ region: 'dfb' as const, extras: [] })),
  ];
  const cultures: (typeof culture.$inferInsert)[] = [];
  const stages: (typeof cultureStage.$inferInsert)[] = [];
  const results: (typeof cultureResult.$inferInsert)[] = [];
  const resultProblems: (typeof cultureResultProblem.$inferInsert)[] = [];

  for (const [i, p] of plan.entries()) {
    const r = REGIONS[p.region];
    const userId = seedId(`user:community:${i}`);
    const gardenId = seedId(`garden:community:${i}`);
    const zoneId = seedId(`zone:community:${i}`);
    const lat = between(r.lat);
    const lng = between(r.lng);
    await tx.insert(user).values({ id: userId, name: `jardin${i + 1}`, email: `communaute-${i + 1}@greenu.test`, emailVerified: true }).onConflictDoNothing();
    await tx.insert(userProfile).values({ userId, pseudo: `Jardin${String(i + 1).padStart(2, '0')}`, timezone: 'Europe/Brussels', profileVisibility: 'private' }).onConflictDoNothing();
    await tx.insert(garden).values({
      id: gardenId, name: `Jardin communauté ${i + 1}`, orgType: 'individual', lat, lng, geohash4: encodeGeohash(lat, lng, 4), altitudeM: Math.round(between(r.alt)),
      koppen: r.koppen, soilType: pick(r.soils) as typeof garden.$inferInsert['soilType'], soilPh: Math.round(between([6, 7.5]) * 10) / 10, timezone: 'Europe/Brussels', // as: valeurs de SOIL_TYPES
      planEditMinRole: 'member', createdBy: userId, shareResults: true,
    }).onConflictDoNothing();
    await tx.insert(gardenEnvironment).values({ gardenId, environment: 'open_air' satisfies Environment, position: 0 }).onConflictDoNothing();
    await tx.insert(gardenMember).values({ id: seedId(`member:community:${i}`), gardenId, userId, role: 'owner' }).onConflictDoNothing();
    for (const code of rnd() < 0.8 ? ['organic', 'mulching'] : ['mulching']) {
      const pid = practices.get(code);
      if (pid) await tx.insert(practiceDeclaration).values({ id: seedId(`practice:community:${i}:${code}`), gardenId, practiceId: pid }).onConflictDoNothing();
    }
    await tx.insert(zone).values({ id: zoneId, gardenId, zoneTypeId: bed.id, name: 'Planche', lengthCm: 500, widthCm: 120 }).onConflictDoNothing();
    for (const y of [year - 3, year - 2, year - 1]) {
      const seasonId = seedId(`season:community:${i}:${y}`);
      await tx.insert(season).values({ id: seasonId, gardenId, year: y, startsOn: `${y}-01-01`, endsOn: `${y}-12-31`, status: 'closed' }).onConflictDoNothing();
      for (const crop of [...COMMON, ...p.extras]) {
        const cultureId = seedId(`culture:community:${i}:${y}:${crop.code}`);
        const varietyId = crop.varieties.length ? varietyRefId(crop.code, pick(crop.varieties)) : null;
        const on = iso(y, Math.round(crop.doy + r.shift + (rnd() - 0.5) * 20));
        const area = Math.round(between([2, 6]) * 10) / 10;
        const yieldKg = Math.max(0.2, crop.yieldKg * between([0.6, 1.4]));
        const successPct = Math.round(between([55, 95]) / 5) * 5;
        cultures.push({ id: cultureId, gardenId, zoneId, seasonId, speciesId: speciesRefId(crop.code), varietyId, method: crop.method, status: 'finished', areaM2: area, createdBy: userId, occupiedFrom: on, occupiedTo: iso(y, 280) });
        stages.push({ gardenId, cultureId, stage: crop.stage, actualOn: on, recordedBy: userId });
        const resultId = seedId(`result:community:${i}:${y}:${crop.code}`);
        results.push({
          id: resultId, gardenId, cultureId, seasonId, totalKg: Math.round(yieldKg * area * 1000) / 1000, areaM2: area, yieldKgM2: Math.round(yieldKg * 1000) / 1000,
          quality: 3 + Math.floor(rnd() * 3), successPct, rating: 3 + Math.floor(rnd() * 3), wouldGrowAgain: rnd() < 0.85, problemsReviewed: true, completeness: 100,
          authorId: userId, submittedAt: new Date(`${iso(y, 290)}T12:00:00Z`),
        });
        const code = crop.problems.length && rnd() < 0.35 ? pick(crop.problems) : null;
        const pid = code ? problems.get(code) : undefined;
        if (pid) resultProblems.push({ resultId, problemId: pid, severity: 1 + Math.floor(rnd() * 3) });
      }
    }
  }
  for (let k = 0; k < cultures.length; k += 200) await tx.insert(culture).values(cultures.slice(k, k + 200)).onConflictDoNothing();
  for (let k = 0; k < stages.length; k += 200) await tx.insert(cultureStage).values(stages.slice(k, k + 200)).onConflictDoNothing();
  for (let k = 0; k < results.length; k += 200) await tx.insert(cultureResult).values(results.slice(k, k + 200)).onConflictDoNothing();
  if (resultProblems.length) await tx.insert(cultureResultProblem).values(resultProblems).onConflictDoNothing();
  await refreshSharedFacts(tx);
}

/**
 * Bilans complets des cultures terminées des Tilleuls (SPEC §14) : leur historique propre apparaît à part dans les
 * recommandations (RCO-09). Le jardin ne partage pas : rien n'entre dans la vue.
 */
export async function seedOwnResults(tx: Tx, gardenId: string, authorId: string, ref: Date) {
  await tx.execute(sql`
    insert into culture_result (garden_id, culture_id, season_id, total_kg, area_m2, yield_kg_m2, quality, success_pct, rating, would_grow_again, problems_reviewed, completeness, author_id, submitted_at)
    select c.garden_id, c.id, c.season_id, h.kg, c.area_m2, case when c.area_m2 > 0 then round(h.kg / c.area_m2, 3) end, 4, 80, 4, true, true, 100, ${authorId}, ${ref.toISOString()}::timestamptz
    from culture c
    join lateral (select coalesce(sum(quantity_kg), 0) as kg from harvest where culture_id = c.id and deleted_at is null) h on true
    where c.garden_id = ${gardenId} and c.status = 'finished' and c.deleted_at is null
    on conflict (culture_id, season_id) do nothing`);
}
