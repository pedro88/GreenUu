'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { resetPassword } from '../actions';

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const action = useAction(resetPassword, { refresh: false, onSuccess: (d) => router.push(d.redirectTo) });
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); void action.run({ token, password }); }}>
      <Stack>
        {action.error?.message === 'linkExpired' ? (
          <>
            <FormError error={action.error} />
            <Link href="/mot-de-passe-oublie">{t('askNewLink')}</Link>
          </>
        ) : null}
        <Field label={t('newPassword')} hint={t('passwordHint')} errors={action.fieldErrors.password}>
          {(p) => <TextInput {...p} type="password" name="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="large" block disabled={action.pending}>{t('resetSubmit')}</Button>
      </Stack>
    </form>
  );
}
