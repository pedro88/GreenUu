import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { gardenStats } from '@/features/stats/service';
import { seasonLabel, trend, type Cell } from '@/features/stats/stats.pure';
import { ExportStats } from '@/features/stats/ui/ExportStats';
import styles from '@/features/stats/ui/Stats.module.scss';
import { tDynamic } from '@/i18n/dynamic';
import { can } from '@/server/authz/scope';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('stats'))('title') };
}

/** Saisons affichées : les 5 dernières, les plus récentes à droite. */
const MAX_SEASONS = 5;

/** Statistiques pluriannuelles (PAGES.md §4 `/statistiques`, SPEC §12.10 STAT). */
export default async function StatsPage({ params }: PageProps<'/app/jardins/[jardinId]/statistiques'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('stats');
  const tq = await getTranslations('quick');
  const f = await getFormatter();
  const s = await gardenStats(db(), scope);
  const seasons = s.seasons.slice(-MAX_SEASONS);
  const label = (y: number) => seasonLabel(y, s.startMonth);
  const successSeasons = [...new Set(s.success.flatMap((r) => [...r.perSeason.keys()]))].sort((a, b) => a - b).slice(-MAX_SEASONS);
  const kg = (n: number) => f.number(n, { maximumFractionDigits: 1 });

  const cell = (perSeason: Map<number, Cell & { kgPerM2?: number | null }>, y: number, i: number, perM2 = false) => {
    const c = perSeason.get(y);
    if (!c) return <td key={y}>—</td>;
    const prev = i > 0 ? perSeason.get(seasons[i - 1] ?? -1)?.kg : undefined;
    const d = trend(c.kg, prev);
    const other = Object.entries(c.other).map(([u, q]) => `${f.number(q ?? 0)} ${tDynamic(tq, `unit_${u}`, u)}`).join(', ');
    return (
      <td key={y} data-season={y}>
        {perM2 && c.kgPerM2 !== undefined && c.kgPerM2 !== null ? t('kgPerM2', { kg: kg(c.kg), perM2: f.number(c.kgPerM2, { maximumFractionDigits: 2 }) }) : t('kg', { kg: kg(c.kg) })}
        {d !== null ? <span className={d >= 0 ? styles.up : styles.down}> {t('trend', { pct: d })}</span> : null}
        {other ? <span className={styles.other}>{other}</span> : null}
      </td>
    );
  };
  const head = (first: string) => (
    <thead><tr><th scope="col">{first}</th>{seasons.map((y) => <th key={y} scope="col">{label(y)}</th>)}</tr></thead>
  );

  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={can(scope, 'garden:export') ? <ExportStats gardenId={scope.gardenId} /> : null} />
      {seasons.length === 0 ? <Card><Muted>{t('empty')}</Muted></Card> : (
        <>
          <Card>
            <h2>{t('bySpecies')}</h2>
            <div className={styles.tableWrap} role="region" aria-label={t('bySpecies')} tabIndex={0}>
              <table className={styles.table} data-testid="stats-species">
                {head(t('species'))}
                <tbody>{s.bySpecies.map((r) => <tr key={r.id} data-testid={`stats-species-${r.id}`}><th scope="row">{r.name}</th>{seasons.map((y, i) => cell(r.perSeason, y, i))}</tr>)}</tbody>
              </table>
            </div>
          </Card>
          <Card>
            <h2>{t('byZone')}</h2>
            <Muted>{t('byZoneHelp')}</Muted>
            <div className={styles.tableWrap} role="region" aria-label={t('byZone')} tabIndex={0}>
              <table className={styles.table} data-testid="stats-zones">
                {head(t('zone'))}
                <tbody>{s.byZone.map((r) => <tr key={r.id} data-testid={`stats-zone-${r.id}`}><th scope="row">{r.name}{r.areaM2 ? '' : ` ${t('noArea')}`}</th>{seasons.map((y, i) => cell(r.perSeason, y, i, true))}</tr>)}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <Card>
        <h2>{t('success')}</h2>
        <Muted>{t('successHelp')}</Muted>
        {s.success.length === 0 ? <Muted>{t('noSuccess')}</Muted> : (
          <div className={styles.tableWrap} role="region" aria-label={t('success')} tabIndex={0}>
            <table className={styles.table} data-testid="stats-success">
              <thead><tr><th scope="col">{t('species')}</th>{successSeasons.map((y) => <th key={y} scope="col">{label(y)}</th>)}</tr></thead>
              <tbody>
                {s.success.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}</th>
                    {successSeasons.map((y) => {
                      const c = r.perSeason.get(y);
                      return <td key={y}>{c ? t('rate', { rate: c.rate, done: c.finished, total: c.finished + c.failed + c.abandoned }) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Stack>
  );
}
