import { and, eq, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { sharedResultFact } from '@/server/db/schema';
import { K_ANONYMITY } from '../result/rules.pure';
import { median } from './score.pure';

/** Secret HMAC de l'année en cours (créé au besoin) : le pseudo-identifiant des jardins change chaque année (§7.6). */
export async function ensureYearSecret(tx: Executor) {
  await tx.execute(sql`insert into reco_secret (year, secret) values (extract(year from now())::int, encode(gen_random_bytes(32), 'hex')) on conflict (year) do nothing`);
}

/** Job `reco.refresh-facts` (§3.6) : la vue suit les bilans, les partages et les révocations (PRV-01, PRV-04). */
export async function refreshSharedFacts(tx: Executor) {
  await ensureYearSecret(tx);
  await tx.execute(sql`refresh materialized view concurrently shared_result_fact`);
}

/** Pseudo-identifiant du jardin courant, calculé comme dans la vue : sert seulement à écarter ses propres faits (RCO-09). */
export async function gardenPseudo(tx: Executor, gardenId: string): Promise<string | null> {
  const rows = await tx.execute<{ p: string }>(sql`select encode(hmac(${gardenId}::text, secret, 'sha256'), 'hex') as p from reco_secret where year = extract(year from now())::int`);
  return [...rows][0]?.p ?? null;
}

/**
 * Résultats communautaires d'une espèce pour sa fiche (PAGES.md §5), tous contextes confondus. Aucun agrégat sous
 * 5 jardins distincts (k-anonymat, §11.3, PRV-06).
 */
export async function speciesCommunityStats(tx: Executor, speciesId: string, environment?: string) {
  const rows = await tx.select({ garden: sharedResultFact.gardenPseudo, successPct: sharedResultFact.successPct, yieldKgM2: sharedResultFact.yieldKgM2, problems: sharedResultFact.problemCodes })
    .from(sharedResultFact).where(and(eq(sharedResultFact.speciesId, speciesId), environment ? sql`${sharedResultFact.environment} = ${environment}` : undefined)).limit(5000);
  const gardens = new Set(rows.map((r) => r.garden)).size;
  if (gardens < K_ANONYMITY) return { gardens, shown: false as const };
  const successes = rows.flatMap((r) => (r.successPct === null ? [] : [r.successPct]));
  const problems = new Map<string, number>();
  for (const r of rows) for (const c of r.problems) problems.set(c, (problems.get(c) ?? 0) + 1);
  return {
    gardens, shown: true as const, results: rows.length,
    meanSuccessPct: successes.length ? Math.round(successes.reduce((a, b) => a + b, 0) / successes.length) : null,
    medianYieldKgM2: median(rows.flatMap((r) => (r.yieldKgM2 === null ? [] : [Number(r.yieldKgM2)]))),
    topProblems: [...problems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, n]) => ({ code, sharePct: Math.round((n / rows.length) * 100) })),
  };
}
