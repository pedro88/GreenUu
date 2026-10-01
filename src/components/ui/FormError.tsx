'use client';

import { tDynamic } from '@/i18n/dynamic';
import { useTranslations } from 'next-intl';
import type { ActionError } from '@/lib/errors';
import { Alert } from './Alert';

/** Message d'erreur global d'une action ; les erreurs de champ sont affichées par chaque Field. */
export function FormError({ error }: { error: ActionError | null }) {
  const t = useTranslations('errors');
  if (!error) return null;
  const key = error.code === 'VALIDATION' && error.message === 'validation' ? 'validation' : error.message;
  return <Alert tone="danger">{tDynamic(t, key, t('internal'))}</Alert>;
}
