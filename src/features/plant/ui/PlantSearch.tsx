'use client';

import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { NativeSelect, TextInput } from '@/components/ui/Field';
import { Row } from '@/components/ui/Layout';

/** Recherche et filtre par famille du référentiel, dans l'URL. */
export function PlantSearch({ families }: { families: { code: string; label: string }[] }) {
  const t = useTranslations('plants');
  const [f, setF] = useQueryStates({ q: parseAsString, famille: parseAsString }, { shallow: false, throttleMs: 300 });
  return (
    <Row role="search">
      <label className="visually-hidden" htmlFor="plant-q">{t('search')}</label>
      <TextInput id="plant-q" type="search" placeholder={t('searchPlaceholder')} defaultValue={f.q ?? ''} onChange={(e) => void setF({ q: e.target.value || null })} data-testid="plants-search" />
      <label className="visually-hidden" htmlFor="plant-family">{t('family')}</label>
      <NativeSelect id="plant-family" value={f.famille ?? ''} onChange={(e) => void setF({ famille: e.target.value || null })}>
        <option value="">{t('allFamilies')}</option>
        {families.map((fa) => <option key={fa.code} value={fa.code}>{fa.label}</option>)}
      </NativeSelect>
    </Row>
  );
}
