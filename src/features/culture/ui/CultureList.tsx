import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import type { CultureListRow } from '../queries';
import styles from './CultureList.module.scss';

export async function CultureList({ gardenId, rows }: { gardenId: string; rows: Pick<CultureListRow, 'id' | 'label' | 'status' | 'zoneName' | 'seasonYear' | 'occupiedFrom' | 'occupiedTo' | 'spriteKey' | 'familyCode'>[] }) {
  const ts = await getTranslations('cultureStatus');
  const t = await getTranslations('cultures');
  const f = await getFormatter();
  const fmt = (d: string | null) => (d ? f.dateTime(new Date(`${d}T12:00:00`), { day: 'numeric', month: 'short' }) : '…');
  return (
    <ul className={styles.list} data-testid="culture-list">
      {rows.map((c) => (
        <li key={c.id}>
          <Link href={`/app/jardins/${gardenId}/cultures/${c.id}`} className={styles.item} data-testid={`culture-${c.id}`}>
            <PlantIcon spriteKey={c.spriteKey} familySprite={familySpriteOf(c.familyCode)} />
            <span>
              <span className={styles.label}>{c.label}</span>
              <span className={styles.meta}>{t('line', { zone: c.zoneName, season: c.seasonYear, from: fmt(c.occupiedFrom), to: fmt(c.occupiedTo) })}</span>
            </span>
            <span className={styles.status}><Badge>{ts(c.status)}</Badge></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Code famille → clé de sprite de famille (livrée par la session sprites). */
export function familySpriteOf(code: string): string | null {
  const map: Record<string, string> = {
    solanaceae: 'solanacees', brassicaceae: 'brassicacees', amaryllidaceae: 'amaryllidacees', cucurbitaceae: 'cucurbitacees', apiaceae: 'apiacees',
    fabaceae: 'fabacees', amaranthaceae: 'amaranthacees', asteraceae: 'asteracees', poaceae: 'poacees', lamiaceae: 'lamiacees', rosaceae: 'rosacees',
  };
  return map[code] ?? null;
}
