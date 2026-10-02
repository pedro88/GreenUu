'use client';

import { useTranslations } from 'next-intl';
import { useAction } from '@/components/ui/useAction';
import { transitionTicketAction } from '../actions';

/** Case « fait » des tâches du jour (maquette tableau de bord) : un tap termine le ticket. */
export function TaskCheck({ gardenId, ticketId, label }: { gardenId: string; ticketId: string; label: string }) {
  const t = useTranslations('tickets');
  const action = useAction(transitionTicketAction);
  return (
    <input type="checkbox" aria-label={t('markDone', { title: label })} disabled={action.pending} checked={action.pending}
      onChange={() => void action.run({ gardenId, ticketId, status: 'done' })} data-testid={`task-check-${ticketId}`} />
  );
}
