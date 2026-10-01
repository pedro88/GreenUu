'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, LinkButton } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { acceptInvitationAction } from '@/features/account/actions';

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations('invitation');
  const router = useRouter();
  const action = useAction(acceptInvitationAction, { refresh: false, onSuccess: (d) => router.push(`/app/jardins/${d.gardenId}`) });
  return (
    <Stack>
      <FormError error={action.error} />
      <Row>
        <Button size="large" onClick={() => void action.run({ token })} disabled={action.pending}>{t('accept')}</Button>
        <LinkButton href="/app" variant="secondary" size="large">{t('decline')}</LinkButton>
      </Row>
    </Stack>
  );
}
