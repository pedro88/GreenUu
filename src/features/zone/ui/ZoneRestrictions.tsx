'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { NativeSelect } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { restrictZoneAction } from '../actions';

type Level = 'none' | 'edit' | 'contribute';

/** §5.3 : restreindre la zone à des groupes (owner / admin). */
export function ZoneRestrictions({ gardenId, zoneId, groups, own }: {
  gardenId: string; zoneId: string; groups: { id: string; name: string }[]; own: { groupId: string; level: 'edit' | 'contribute' }[];
}) {
  const t = useTranslations('zones');
  const [levels, setLevels] = useState<Record<string, Level>>(Object.fromEntries(groups.map((g) => [g.id, own.find((o) => o.groupId === g.id)?.level ?? 'none'])));
  const [saved, setSaved] = useState(false);
  const action = useAction(restrictZoneAction, { onSuccess: () => setSaved(true) });
  if (groups.length === 0) return <p>{t('noGroupsForRestriction')}</p>;
  return (
    <Stack gap="sm">
      <FormError error={action.error} />
      {saved ? <Alert tone="success">{t('restrictionsSaved')}</Alert> : null}
      {groups.map((g) => (
        <Row key={g.id}>
          <label htmlFor={`restrict-${g.id}`}>{g.name}</label>
          <NativeSelect id={`restrict-${g.id}`} value={levels[g.id] ?? 'none'} onChange={(e) => { setSaved(false); setLevels((s) => ({ ...s, [g.id]: e.target.value === 'edit' ? 'edit' : e.target.value === 'contribute' ? 'contribute' : 'none' })); }}>
            <option value="none">{t('levelNone')}</option>
            <option value="contribute">{t('levelContribute')}</option>
            <option value="edit">{t('levelEdit')}</option>
          </NativeSelect>
        </Row>
      ))}
      <Row>
        <Button variant="secondary" disabled={action.pending} onClick={() => void action.run({
          gardenId, zoneId,
          restrictions: Object.entries(levels).flatMap(([groupId, level]) => (level === 'none' ? [] : [{ groupId, level }])),
        })}>{t('saveRestrictions')}</Button>
      </Row>
    </Stack>
  );
}
