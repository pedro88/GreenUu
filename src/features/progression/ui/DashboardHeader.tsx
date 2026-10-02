import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PixelIcon } from '@/components/ui/PlantIcon';
import type { AvatarConfigV1 } from '@/features/avatar/config.pure';
import { AvatarThumb } from '@/features/avatar/ui/AvatarThumb';
import { tDynamic } from '@/i18n/dynamic';
import { nextLevelAt } from '../rules.pure';
import styles from './DashboardHeader.module.scss';

type Quest = { id: string; kind: string; titleKey: string; titleParams: Record<string, string | number>; progress: number; target: number };

/** En-tête du tableau de bord (maquette « Accueil ») : avatar, salutation, niveau et barre d'XP, quête du jour. */
export async function DashboardHeader({ name, level, totalXp, quest, avatar }: {
  name: string; level: number; totalXp: number; quest: Quest | null; avatar: { userId: string; config: AvatarConfigV1; configHash: string };
}) {
  const t = await getTranslations('dashboard');
  const tq = await getTranslations('quests');
  const from = nextLevelAt(level - 1);
  const to = nextLevelAt(level);
  const pct = Math.round((100 * Math.max(0, totalXp - from)) / Math.max(1, to - from));
  return (
    <div className={styles.wrap}>
      <header className={styles.card}>
        <Link href="/app/profil/avatar" className={styles.avatar} aria-label={t('editAvatar')}>
          <AvatarThumb userId={avatar.userId} config={avatar.config} configHash={avatar.configHash} pseudo={name} size={64} />
        </Link>
        <h1 className={styles.hello}>{t('hello', { name })}</h1>
        <div className={styles.level}>
          <Link href="/app/profil/xp" className={styles.levelPill} data-testid="dashboard-level">{t('level', { level })}</Link>
          <span className={styles.xp}>
            <span aria-hidden>{t('xp')}</span>
            <span className={styles.bar} role="progressbar" aria-label={t('xpProgress', { next: level + 1 })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </span>
          </span>
        </div>
      </header>
      {quest ? (
        <Link href="/app/profil/quetes" className={styles.quest} data-testid="dashboard-quest">
          <span className={styles.questTitle}>{t('quest')}</span>
          <span className={styles.questBody}>
            <PixelIcon name="ui/xp" size={32} />
            <span>{tDynamic(tq, quest.titleKey, quest.titleKey, quest.titleParams)}</span>
          </span>
          {quest.target > 1 ? (
            <span className={styles.questProgress}>
              <span className={styles.bar} aria-hidden><span style={{ width: `${Math.round((100 * quest.progress) / quest.target)}%` }} /></span>
              <span>{quest.progress}/{quest.target}</span>
            </span>
          ) : null}
        </Link>
      ) : null}
    </div>
  );
}
