'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Checkbox } from '@/components/ui/Field';
import { useAction } from '@/components/ui/useAction';
import { setLeaderboardOptOutAction } from '../actions';

/** §8.7 : chacun peut s'exclure des classements (jamais imposés). */
export function OptOutToggle({ initial }: { initial: boolean }) {
  const t = useTranslations('profile');
  const [on, setOn] = useState(initial);
  const action = useAction(setLeaderboardOptOutAction, { onSuccess: (d) => setOn(d.optOut) });
  return <Checkbox label={t('leaderboardOptOut')} checked={on} disabled={action.pending} onChange={(e) => void action.run({ optOut: e.target.checked })} data-testid="leaderboard-opt-out" />;
}
