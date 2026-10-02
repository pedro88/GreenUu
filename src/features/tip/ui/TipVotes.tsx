'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAction } from '@/components/ui/useAction';
import styles from '../../guide/ui/Content.module.scss';
import { voteTipAction } from '../actions';

/** RG-TIP-02 : « utile » / « pas utile », modifiable et annulable (un nouveau clic retire le vote). */
export function TipVotes({ tipId, useful, notUseful, myVote, own }: { tipId: string; useful: number; notUseful: number; myVote: number; own: boolean }) {
  const t = useTranslations('tips');
  const [state, setState] = useState({ useful, notUseful, myVote });
  const vote = useAction(voteTipAction, { refresh: false, onSuccess: (d) => setState({ useful: d.useful, notUseful: d.notUseful, myVote: d.value }) });
  if (own) return <span className={styles.meta}>{t('own')} · {t('usefulCount', { count: state.useful })}</span>;
  const cast = (v: 1 | -1) => void vote.run({ tipId, value: state.myVote === v ? 0 : v });
  return (
    <div className={styles.votes}>
      <Button variant="secondary" className={styles.vote} aria-pressed={state.myVote === 1} onClick={() => cast(1)} disabled={vote.pending}
        aria-label={t('voteLabel', { label: t('useful') })} data-testid={`tip-useful-${tipId}`}>
        <ThumbsUp aria-hidden size={18} />{t('usefulCount', { count: state.useful })}
      </Button>
      <Button variant="secondary" className={styles.vote} aria-pressed={state.myVote === -1} onClick={() => cast(-1)} disabled={vote.pending}
        aria-label={t('voteLabel', { label: t('notUseful') })} data-testid={`tip-not-useful-${tipId}`}>
        <ThumbsDown aria-hidden size={18} />{state.notUseful}
      </Button>
    </div>
  );
}
