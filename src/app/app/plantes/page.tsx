import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import { familySpriteOf } from '@/features/culture/ui/CultureList';
import { listFamilies, listSpecies, searchPlants } from '@/features/plant/service';
import styles from '@/features/plant/ui/Plant.module.scss';
import { PlantSearch } from '@/features/plant/ui/PlantSearch';
import { tDynamic } from '@/i18n/dynamic';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('plants'))('title') };
}

/** Référentiel végétal (PAGES.md §5) : recherche tolérante, filtre par famille. */
export default async function PlantsPage({ searchParams }: PageProps<'/app/plantes'>) {
  const u = await requireUser();
  const { q, famille } = await searchParams;
  const t = await getTranslations('plants');
  const tf = await getTranslations('families');
  const families = await listFamilies(db());
  const query = typeof q === 'string' ? q : '';
  const hits = query.trim().length >= 2 ? await searchPlants(db(), u.id, query, 30) : null;
  const list = hits ? [] : await listSpecies(db(), { familyCode: typeof famille === 'string' ? famille : undefined });
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} actions={<LinkButton href="/app/plantes/proposer" variant="secondary">{t('propose')}</LinkButton>} />
      <PlantSearch families={families.map((f) => ({ code: f.code, label: tDynamic(tf, f.code, f.latinName) }))} />
      {hits ? (
        hits.length === 0 ? <Muted>{t('noResult')}</Muted> : (
          <ul className={styles.grid} data-testid="plant-results">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <Link className={styles.card} href={`/app/plantes/${h.kind === 'species' ? h.id : h.speciesId}`}>
                  <PlantIcon spriteKey={h.spriteKey} size={64} />
                  {h.kind === 'species' ? h.name : `${h.speciesName} ${h.name}`}
                  {h.kind === 'variety' && h.status !== 'approved' ? <small>{t('pending')}</small> : null}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className={styles.grid} data-testid="species-list">
          {list.map((s) => (
            <li key={s.id}>
              <Link className={styles.card} href={`/app/plantes/${s.id}`}><PlantIcon spriteKey={s.spriteKey} familySprite={familySpriteOf(s.familyCode)} size={64} />{s.names.fr[0]}</Link>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
