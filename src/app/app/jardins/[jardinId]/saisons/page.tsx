import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import { listCultures, seasonGrid } from '@/features/culture/queries';
import { familySpriteOf } from '@/features/culture/ui/CultureList';
import { getGarden } from '@/features/garden/service';
import { seasonBounds, seasonYearOf } from '@/features/season/season.pure';
import styles from '@/features/season/ui/SeasonGrid.module.scss';
import { tDynamic } from '@/i18n/dynamic';
import { localDate } from '@/lib/dates';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('seasons'))('title') };
}

/** Planification et rotations (PAGES.md §4, RG-ROT-05). */
export default async function SeasonsPage({ params }: PageProps<'/app/jardins/[jardinId]/saisons'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('seasons');
  const tf = await getTranslations('families');
  const g = await getGarden(db(), scope);
  const year = seasonYearOf(localDate(appClock().now(), g.timezone), g.seasonStartMonth);
  const grid = await seasonGrid(db(), scope, year);
  const current = await listCultures(db(), scope, { season: year });
  const { startsOn } = seasonBounds(year, g.seasonStartMonth);
  const start = new Date(`${startsOn}T00:00:00`).getTime();
  const span = 365 * 86_400_000;
  const pct = (d: string | null, fallback: number) => (d ? Math.min(100, Math.max(0, ((new Date(`${d}T00:00:00`).getTime() - start) / span) * 100)) : fallback);
  const months = Array.from({ length: 12 }, (_, i) => new Date(2026, (g.seasonStartMonth - 1 + i) % 12, 1).toLocaleDateString('fr', { month: 'short' }));
  const hasEarly = grid.rows.some((r) => r.cells.some((c) => c.cultures.some((x) => x.early)));
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      {hasEarly ? <Muted><AlertTriangle aria-hidden size={16} /> {t('earlyLegend')}</Muted> : null}
      <Card className={styles.wrap}>
        <table className={styles.grid} data-testid="season-grid">
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">{t('zone')}</span></th>
              {grid.years.map((y) => <th key={y} scope="col" className={y === year ? styles.current : undefined}>{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.zoneId}>
                <th scope="row" style={{ paddingLeft: `${r.depth}rem` }}>{r.zoneName}</th>
                {r.cells.map((c) => (
                  <td key={c.year} className={styles.cell}>
                    {c.cultures.map((x) => (
                      <Link key={x.id} href={`/app/jardins/${scope.gardenId}/cultures/${x.id}`} className={`${styles.chip} ${x.early ? styles.early : ''}`}
                        data-testid={x.early ? 'rotation-early' : 'rotation-ok'} title={tDynamic(tf, x.familyCode, x.familyCode)}>
                        <PlantIcon spriteKey={x.spriteKey} familySprite={familySpriteOf(x.familyCode)} size={32} />
                        <span>{x.label}{x.early ? <><span className="visually-hidden"> — {t('early')}</span> <AlertTriangle aria-hidden size={14} /></> : null}</span>
                      </Link>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <Stack>
          <h2>{t('calendarTitle', { year })}</h2>
          {current.length === 0 ? <Muted>{t('noCurrent')}</Muted> : (
            <>
              <div className={styles.months} aria-hidden>{months.map((m) => <span key={m}>{m}</span>)}</div>
              <ul className={styles.gantt}>
                {current.map((c) => {
                  const left = pct(c.occupiedFrom, 0);
                  const right = pct(c.occupiedTo, 100);
                  return (
                    <li key={c.id}>
                      <Link href={`/app/jardins/${scope.gardenId}/cultures/${c.id}`}>{c.label}</Link> · {c.zoneName}
                      <div className={styles.track}><span className={styles.bar} style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
