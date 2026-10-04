'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { requestPasswordReset } from '../actions';

export function ForgotForm() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const action = useAction(requestPasswordReset, { refresh: false, onSuccess: () => setSent(true) });
  if (sent) return <Alert tone="success">{t('forgotSent')}</Alert>;
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); void action.run({ email }); }}>
      <Stack>
        <Field label={t('email')} errors={action.fieldErrors.email}>
          {(p) => <TextInput {...p} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Button type="submit" size="large" block disabled={action.pending}>{t('forgotSubmit')}</Button>
      </Stack>
    </form>
  );
}
