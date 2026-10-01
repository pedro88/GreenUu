'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { signOut, updateAccount } from '../actions';

export function AccountForm({ initial }: { initial: { pseudo: string; timezone: string; locale: 'fr' | 'en' } }) {
  const t = useTranslations('account');
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction(updateAccount, { onSuccess: () => setSaved(true) });
  const out = useAction(signOut, { refresh: false, onSuccess: () => router.push('/connexion') });
  return (
    <Stack>
      <form onSubmit={(e) => { e.preventDefault(); void action.run(v); }}>
        <Stack>
          {saved ? <Alert tone="success">{t('saved')}</Alert> : null}
          <FormError error={action.error && !Object.keys(action.fieldErrors).length ? action.error : null} />
          <Field label={t('pseudo')} errors={action.fieldErrors.pseudo}>{(p) => <TextInput {...p} value={v.pseudo} onChange={(e) => setV({ ...v, pseudo: e.target.value })} />}</Field>
          <Field label={t('timezone')} errors={action.fieldErrors.timezone}>{(p) => <TextInput {...p} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} />}</Field>
          <Field label={t('locale')}>{(p) => (
            <NativeSelect {...p} value={v.locale} onChange={(e) => setV({ ...v, locale: e.target.value === 'en' ? 'en' : 'fr' })}>
              <option value="fr">{t('localeFr')}</option>
              <option value="en">{t('localeEn')}</option>
            </NativeSelect>
          )}</Field>
          <Row><Button type="submit" disabled={action.pending}>{t('save')}</Button></Row>
        </Stack>
      </form>
      <Row><Button variant="secondary" onClick={() => void out.run(undefined)} data-testid="sign-out">{t('signOut')}</Button></Row>
    </Stack>
  );
}
