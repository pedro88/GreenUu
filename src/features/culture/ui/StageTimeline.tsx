import { Check } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PixelIcon } from '@/components/ui/PlantIcon';
import type { Stage } from '@/lib/enums';
import styles from './CultureDetail.module.scss';

/** Icône pixel art de chaque étape (sprites HD d'interface). */
const STAGE_ICON: Record<Stage, string> = {
  sowing: 'ui/action-semer', emergence: 'ui/action-planter', transplanting: 'ui/action-planter', planting: 'ui/action-planter', flowering: 'ui/saison-printemps',
  fruiting: 'ui/competence-fruitiers', harvest_start: 'ui/action-recolter', harvest_end: 'ui/action-recolter', seed_set: 'ui/competence-semences', end: 'ui/competence-compost',
};

/** Frise des étapes (maquette fiche culture) : faites, en cours, à venir. */
export async function StageTimeline({ stages }: { stages: { stage: Stage; plannedOn: string | null; actualOn: string | null }[] }) {
  const t = await getTranslations('stages');
  const tc = await getTranslations('cultureDetail');
  const f = await getFormatter();
  const lastDone = stages.reduce((i, s, idx) => (s.actualOn ? idx : i), -1);
  const fmt = (d: string) => f.dateTime(new Date(`${d}T12:00:00`), { day: 'numeric', month: 'short' });
  return (
    <ol className={styles.timeline} aria-label={tc('timeline')}>
      {stages.map((s, idx) => {
        const done = s.actualOn !== null;
        const current = !done && idx === lastDone + 1;
        return (
          <li key={s.stage} className={`${styles.stage} ${done ? styles.done : ''} ${current ? styles.current : ''}`} data-testid={`stage-${s.stage}`} data-done={done}>
            <span className={styles.dot} aria-hidden>
              <PixelIcon name={STAGE_ICON[s.stage]} size={32} />
              {done ? <span className={styles.doneMark}><Check size={14} /></span> : null}
            </span>
            <strong>{t(s.stage)}</strong>
            <span>{s.actualOn ? fmt(s.actualOn) : s.plannedOn ? tc('planned', { date: fmt(s.plannedOn) }) : '—'}</span>
          </li>
        );
      })}
    </ol>
  );
}
