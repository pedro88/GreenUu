'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { GOAL_METRICS, type GoalMetric } from '@/lib/enums';
import { createGoalAction, setLeaderboardAction } from '../actions';

export function LeaderboardToggle({ gardenId, enabled }: { gardenId: string; enabled: boolean }) {
  const t = useTranslations('collective');
  const action = useAction(setLeaderboardAction);
  return <Button variant="secondary" disabled={action.pending} onClick={() => void action.run({ gardenId, enabled: !enabled })} data-testid="leaderboard-toggle">{enabled ? t('leaderboardDisable') : t('leaderboardEnable')}</Button>;
}

export function GoalForm({ gardenId, groups, today }: { gardenId: string; groups: { id: string; name: string }[]; today: string }) {
  const t = useTranslations('collective');
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState<GoalMetric>('tickets_completed');
  const [target, setTarget] = useState('10');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [groupId, setGroupId] = useState('');
  const action = useAction(createGoalAction, { onSuccess: () => setTitle('') });
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); void action.run({ gardenId, title, metric, target: Number(target), periodStart: start, periodEnd: end, groupId }); }} data-testid="goal-form">
      <Stack gap="sm">
        <FormError error={action.error && !Object.keys(action.fieldErrors).length ? action.error : null} />
        <Field label={t('goalTitle')} errors={action.fieldErrors.title}>{(p) => <TextInput {...p} required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Row>
          <Field label={t('goalMetric')}>{(p) => (
            <NativeSelect {...p} value={metric} onChange={(e) => setMetric(GOAL_METRICS.find((m) => m === e.target.value) ?? metric)}>
              {GOAL_METRICS.map((m) => <option key={m} value={m}>{t(`metric_${m}`)}</option>)}
            </NativeSelect>
          )}</Field>
          <Field label={t('goalTarget')}>{(p) => <TextInput {...p} type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />}</Field>
        </Row>
        <Row>
          <Field label={t('goalStart')}>{(p) => <TextInput {...p} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label={t('goalEnd')} errors={action.fieldErrors.periodEnd}>{(p) => <TextInput {...p} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
          <Field label={t('goalGroup')}>{(p) => (
            <NativeSelect {...p} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">{t('goalAll')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </NativeSelect>
          )}</Field>
        </Row>
        <Button type="submit" disabled={action.pending || title.trim().length < 3}>{t('goalCreate')}</Button>
      </Stack>
    </form>
  );
}
