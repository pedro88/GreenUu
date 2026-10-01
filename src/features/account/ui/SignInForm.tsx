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
import { signIn } from '../actions';

export function SignInForm({ next }: { next?: string | undefined }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction(signIn, { refresh: false, onSuccess: (d) => router.push(d.redirectTo) });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void action.run({ email, password, ...(next ? { next } : {}) });
      }}
    >
      <Stack>
        <FormError error={action.error} />
        <Field label={t('email')}>{(p) => <TextInput {...p} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label={t('password')}>{(p) => <TextInput {...p} type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Button type="submit" size="large" block disabled={action.pending}>{t('signInSubmit')}</Button>
        <Link href="/mot-de-passe-oublie">{t('forgotLink')}</Link>
        <p>{t('noAccount')} <Link href="/inscription">{t('signUpLink')}</Link></p>
      </Stack>
    </form>
  );
}
