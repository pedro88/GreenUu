'use client';

import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { NativeSelect } from '@/components/ui/Field';
import { Row } from '@/components/ui/Layout';
import { CULTURE_STATUSES } from '@/lib/enums';

/** Filtres de la liste des cultures, dans l'URL (SPEC §3.1 : nuqs). */
export function CultureFilters({ years, zones, speciesOptions }: { years: number[]; zones: { id: string; label: string }[]; speciesOptions: { id: string; label: string }[] }) {
  const t = useTranslations('cultures');
  const ts = useTranslations('cultureStatus');
  const [f, setF] = useQueryStates(
    { season: parseAsInteger, zone: parseAsString, species: parseAsString, status: parseAsString },
    { shallow: false },
  );
  return (
    <Row role="search" aria-label={t('filters')}>
      <label className="visually-hidden" htmlFor="f-season">{t('season')}</label>
      <NativeSelect id="f-season" value={f.season?.toString() ?? ''} onChange={(e) => void setF({ season: e.target.value ? Number(e.target.value) : null })}>
        <option value="">{t('allSeasons')}</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </NativeSelect>
      <label className="visually-hidden" htmlFor="f-zone">{t('zone')}</label>
      <NativeSelect id="f-zone" value={f.zone ?? ''} onChange={(e) => void setF({ zone: e.target.value || null })}>
        <option value="">{t('allZones')}</option>
        {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
      </NativeSelect>
      <label className="visually-hidden" htmlFor="f-species">{t('species')}</label>
      <NativeSelect id="f-species" value={f.species ?? ''} onChange={(e) => void setF({ species: e.target.value || null })}>
        <option value="">{t('allSpecies')}</option>
        {speciesOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </NativeSelect>
      <label className="visually-hidden" htmlFor="f-status">{t('status')}</label>
      <NativeSelect id="f-status" value={f.status ?? ''} onChange={(e) => void setF({ status: e.target.value || null })}>
        <option value="">{t('allStatuses')}</option>
        {CULTURE_STATUSES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
      </NativeSelect>
    </Row>
  );
}
