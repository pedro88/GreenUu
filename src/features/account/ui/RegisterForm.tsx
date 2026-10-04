'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextInput, useValidationMessage } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { register } from '../actions';

export function RegisterForm({ invitation }: { invitation?: { token: string; email: string } }) {
  const t = useTranslations('auth');
  const msg = useValidationMessage();
  const router = useRouter();
  const [email, setEmail] = useState(invitation?.email ?? '');
  const [password, setPassword] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const action = useAction(register, { refresh: false, onSuccess: (d) => router.push(d.redirectTo) });
  const fe = action.fieldErrors;
  return (
    <form method="post"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run({
          email, password, pseudo, acceptTerms,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(invitation ? { invitationToken: invitation.token } : {}),
        });
      }}
    >
      <Stack>
        {action.error && !Object.keys(fe).length ? <FormError error={action.error} /> : null}
        <Field label={t('email')} errors={fe.email}>
          {(p) => <TextInput {...p} type="email" name="email" autoComplete="email" required readOnly={Boolean(invitation)} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={t('pseudo')} hint={t('pseudoHint')} errors={fe.pseudo}>
          {(p) => <TextInput {...p} name="pseudo" autoComplete="username" required minLength={3} maxLength={24} value={pseudo} onChange={(e) => setPseudo(e.target.value)} />}
        </Field>
        <Field label={t('password')} hint={t('passwordHint')} errors={fe.password}>
          {(p) => <TextInput {...p} type="password" name="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Checkbox
          name="acceptTerms"
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          label={t.rich('acceptTerms', { link: (c) => <Link href="/cgu" target="_blank">{c}</Link> })}
        />
        {fe.acceptTerms ? <span role="alert">{fe.acceptTerms.map(msg).join(' ')}</span> : null}
        <Button type="submit" size="large" block disabled={action.pending}>{t('signUpSubmit')}</Button>
        {!invitation ? <p>{t('hasAccount')} <Link href="/connexion">{t('signInLink')}</Link></p> : null}
      </Stack>
    </form>
  );
}
