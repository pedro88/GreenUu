import { getTranslations } from 'next-intl/server';
import { Card, Muted, Stack } from '@/components/ui/Layout';
import { localDate } from '@/lib/dates';
import type { Scope } from '@/server/authz/scope';
import { can } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { contributions, gardenXp, goalsOf, leaderboard } from '../collective';
import { GoalForm, LeaderboardToggle } from './CollectiveControls';
import styles from './Contributions.module.scss';

/** Onglet « Contributions » (§8.7) : actions par membre, sans rang ; classement seulement si un admin l'active. */
export async function ContributionsPanel({ tx, scope, now, timezone, groups }: { tx: Executor; scope: Scope; now: Date; timezone: string; groups: { id: string; name: string }[] }) {
  const t = await getTranslations('collective');
  const period = { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  const [rows, goals, board, xp] = await Promise.all([contributions(tx, scope, period), goalsOf(tx, scope), leaderboard(tx, scope, now), gardenXp(tx, scope.gardenId)]);
  return (
    <Stack gap="lg">
      <Card>
        <Stack gap="sm">
          <Muted>{t('period')} · {t('gardenXp', { xp })}</Muted>
          <div className={styles.tableWrap} role="region" aria-label={t('tableLabel')} tabIndex={0}>
          <table className={styles.table} data-testid="contributions">
            <thead><tr><th scope="col">{t('member')}</th><th scope="col">{t('tickets')}</th><th scope="col">{t('observations')}</th><th scope="col">{t('harvests')}</th><th scope="col">{t('results')}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.userId}><th scope="row">{r.pseudo}</th><td>{r.tickets}</td><td>{r.observations}</td><td>{r.harvests}</td><td>{r.results}</td></tr>)}</tbody>
          </table>
          </div>
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h3>{t('goals')}</h3>
          {goals.length === 0 ? <Muted>{t('noGoal')}</Muted> : (
            <ul data-testid="goals">{goals.map((g) => <li key={g.id}>{g.title} · {t(`metric_${g.metric}`)} · <strong data-testid={`goal-progress-${g.id}`}>{t('goalProgress', { current: g.current, target: g.target })}</strong></li>)}</ul>
          )}
          {can(scope, 'goal:manage') && !scope.archived ? <GoalForm gardenId={scope.gardenId} groups={groups} today={localDate(now, timezone)} /> : null}
        </Stack>
      </Card>
      {can(scope, 'leaderboard:toggle') ? <LeaderboardToggle gardenId={scope.gardenId} enabled={board !== null} /> : null}
      {board ? (
        <Card>
          <h3>{t('leaderboard')}</h3>
          <ol data-testid="leaderboard">{board.map((r) => <li key={r.userId}>{r.pseudo} · {r.xp}</li>)}</ol>
        </Card>
      ) : null}
    </Stack>
  );
}
