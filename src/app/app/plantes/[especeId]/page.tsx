import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, Muted, Stack } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import { familySpriteOf } from '@/features/culture/ui/CultureList';
import { speciesDetail } from '@/features/plant/service';
import styles from '@/features/plant/ui/Plant.module.scss';
import { tDynamic } from '@/i18n/dynamic';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

const doyToDate = (doy: number) => new Date(Date.UTC(2026, 0, doy));

/** Fiche espèce (maquette « Carotte ») : besoins, variétés, associations, calendrier indicatif. */
export default async function SpeciesPage({ params }: PageProps<'/app/plantes/[especeId]'>) {
  const { especeId } = await params;
  const u = await requireUser();
  if (!uuidSchema.safeParse(especeId).success) notFound();
  const s = await speciesDetail(db(), u.id, especeId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const t = await getTranslations('plants');
  const tf = await getTranslations('families');
  const tm = await getTranslations('methods');
  const tst = await getTranslations('stages');
  const month = (doy: number) => doyToDate(doy).toLocaleDateString('fr', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <Stack gap="lg">
      <div className={styles.hero}>
        <PlantIcon spriteKey={s.spriteKey} familySprite={familySpriteOf(s.family.code)} size={96} />
        <div>
          <h1 data-testid="species-title">{s.commonNames.fr[0]}</h1>
          <p>{tDynamic(tf, s.family.code, s.family.latinName)} · <em>{s.latinName}</em></p>
          {s.perennial ? <Badge>{t('perennial')}</Badge> : null}
        </div>
      </div>
      <div className={styles.needs}>
        <div className={styles.need}>{t(`sun_${s.sun}`)}</div>
        <div className={styles.need}>{t(`water_${s.water}`)}</div>
        <div className={styles.need}>{t('spacing', { row: s.spacingRowCm ?? 0, plant: s.spacingPlantCm ?? 0 })}</div>
        <div className={styles.need}>{t('days', { min: s.daysToMaturityMin ?? 0, max: s.daysToMaturityMax ?? 0 })}</div>
      </div>
      <Card>
        <Stack gap="sm">
          <h2>{t('varieties')}</h2>
          {s.varieties.length === 0 ? <Muted>{t('noVariety')}</Muted> : (
            <div className={styles.chips} data-testid="varieties">
              {s.varieties.map((v) => <span key={v.id} className={styles.chip}><PlantIcon spriteKey={v.spriteKey ?? s.spriteKey} size={32} />{v.name}{v.status !== 'approved' ? ` (${t('pending')})` : ''}</span>)}
            </div>
          )}
          <Link href={`/app/plantes/proposer?espece=${s.id}`}>{t('propose')}</Link>
        </Stack>
      </Card>
      {s.companions.length > 0 ? (
        <Card>
          <Stack gap="sm">
            <h2>{t('companions')}</h2>
            <div className={styles.chips} data-testid="companions">
              {s.companions.map((c) => (
                <Link key={c.id} href={`/app/plantes/${c.id}`} className={`${styles.chip} ${c.effect === 'unfavorable' ? styles.bad : ''}`} data-effect={c.effect}>
                  <PlantIcon spriteKey={c.spriteKey} size={32} />{c.name}<span className="visually-hidden"> — {t(c.effect)}</span>{c.effect === 'unfavorable' ? ' ✕' : ''}
                </Link>
              ))}
            </div>
          </Stack>
        </Card>
      ) : null}
      {s.calendars.length > 0 ? (
        <Card>
          <Stack gap="sm">
            <h2>{t('calendar')}</h2>
            <Muted>{t('calendarNote')}</Muted>
            <ul>{s.calendars.map((c) => <li key={c.id}>{tst(c.stage)} ({tm(c.method)}) : {t('window', { from: month(c.windowStartDoy), to: month(c.windowEndDoy) })}</li>)}</ul>
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
