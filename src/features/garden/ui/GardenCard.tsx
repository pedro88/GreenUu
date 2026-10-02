import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import type { GardenRole, OrgType } from '@/lib/enums';
import styles from './GardenCard.module.scss';

export type GardenCardData = { id: string; name: string; orgType: OrgType; placeLabel: string | null; role: GardenRole; memberCount: number; archivedAt: Date | null };

/** Mini-scène décorative de la vignette (maquette « Mes jardins ») : deux planches garnies. */
const THUMB_BEDS = [['tomate', 'tomate', 'tomate', 'chou'], ['carotte', 'carotte', 'laitue', 'laitue']];

export async function GardenCard({ garden }: { garden: GardenCardData }) {
  const t = await getTranslations('gardens');
  const tr = await getTranslations('roles');
  const to = await getTranslations('orgTypes');
  return (
    <Link href={`/app/jardins/${garden.id}`} className={styles.card} data-testid={`garden-card-${garden.id}`}>
      <span className={styles.thumb} aria-hidden>
        {THUMB_BEDS.map((bed, i) => <span key={i} className={styles.bed}>{bed.map((sp, j) => <PlantIcon key={j} spriteKey={sp} size={32} />)}</span>)}
      </span>
      <span className={styles.name}>{garden.name}</span>
      <span className={styles.meta}>
        <Badge data-testid="garden-role">{tr(garden.role)}</Badge>
        <span>{to(garden.orgType)}</span>
        <span>{t('memberCount', { count: garden.memberCount })}</span>
        {garden.archivedAt ? <Badge>{t('archived')}</Badge> : null}
      </span>
    </Link>
  );
}
