'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useAction } from '@/components/ui/useAction';
import { revokeInvitationAction } from '../actions';

export function RevokeInvitation({ gardenId, invitationId }: { gardenId: string; invitationId: string }) {
  const t = useTranslations('members');
  const action = useAction(revokeInvitationAction);
  return <Button variant="secondary" disabled={action.pending} onClick={() => void action.run({ gardenId, invitationId })}>{t('revoke')}</Button>;
}
