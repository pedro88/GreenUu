import { getTranslations } from 'next-intl/server';
import { Badge, Card, Muted, Row, Stack } from '@/components/ui/Layout';
import { getGarden } from '@/features/garden/service';
import { listGroups } from '@/features/group/service';
import { collectiveAchievements, gardenXp, goalsOf } from '@/features/progression/collective';
import { gardenLevelOf, gardenNextLevelAt } from '@/features/progression/rules.pure';
import { GoalForm } from '@/features/progression/ui/CollectiveControls';
import styles from '@/features/progression/ui/Contributions.module.scss';
import { tDynamic } from '@/i18n/dynamic';
import { localDate } from '@/lib/dates';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('collective'))('pageTitle') };
}

/** Progression collective (PAGES.md §4 `/progression`, SPEC §8.7) : niveau du jardin, objectifs de groupe, succès collectifs. */
export default async function GardenProgressionPage({ params }: PageProps<'/app/jardins/[jardinId]/progression'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('collective');
  const ta = await getTranslations('achievements');
  const now = appClock().now();
  const [g, xp, goals, achievements, groups] = await Promise.all([getGarden(db(), scope), gardenXp(db(), scope.gardenId), goalsOf(db(), scope), collectiveAchievements(db(), scope), listGroups(db(), scope)]);
  const level = gardenLevelOf(xp);
  const groupName = new Map(groups.map((x) => [x.id, x.name]));
  return (
    <Stack gap="lg">
      <h2>{t('pageTitle')}</h2>
      <Card>
        <Stack gap="sm">
          <Row><Badge data-testid="garden-level">{t('gardenLevel', { level })}</Badge><strong data-testid="garden-xp">{t('gardenXp', { xp })}</strong></Row>
          <progress className={styles.progress} max={gardenNextLevelAt(level)} value={xp} aria-label={t('nextLevel', { level: level + 1 })} />
          <Muted>{t('nextLevelIn', { xp: Math.max(0, gardenNextLevelAt(level) - xp), level: level + 1 })}</Muted>
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h3>{t('goals')}</h3>
          {goals.length === 0 ? <Muted>{t('noGoal')}</Muted> : (
            <ul className={styles.goals} data-testid="progression-goals">
              {goals.map((x) => (
                <li key={x.id} data-testid={`progression-goal-${x.id}`}>
                  <strong>{x.title}</strong> · {t(`metric_${x.metric}`)}{x.groupId ? ` · ${groupName.get(x.groupId) ?? ''}` : ''}
                  <progress className={styles.progress} max={Number(x.target)} value={Math.min(x.current, Number(x.target))} aria-label={x.title} />
                  <span>{t('goalProgress', { current: x.current, target: x.target })}</span>
                </li>
              ))}
            </ul>
          )}
          {can(scope, 'goal:manage') && !scope.archived ? <GoalForm gardenId={scope.gardenId} groups={groups.map((x) => ({ id: x.id, name: x.name }))} today={localDate(now, g.timezone)} /> : null}
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h3>{t('achievementsTitle')}</h3>
          {achievements.length === 0 ? <Muted>{t('noAchievement')}</Muted> : (
            <ul data-testid="collective-achievements">
              {achievements.map((a) => <li key={a.code}><strong>{tDynamic(ta, a.code, a.code)}</strong> · {t('achievedBy', { count: a.members.length, names: a.members.join(', ') })}</li>)}
            </ul>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
