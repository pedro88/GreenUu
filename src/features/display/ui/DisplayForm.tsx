'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import type { DefaultView } from '@/lib/enums';
import { setDisplayPrefsAction } from '../actions';

/** `/app/parametres/affichage` (PAGES.md §7) : vue par défaut d'un jardin et animations réduites. */
export function DisplayForm({ initial }: { initial: { defaultView: DefaultView; reducedMotion: boolean } }) {
  const t = useTranslations('display');
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const action = useAction(setDisplayPrefsAction, { onSuccess: () => setSaved(true) });
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); setSaved(false); void action.run(v); }}>
      <Stack gap="sm">
        <fieldset>
          <legend>{t('defaultView')}</legend>
          {(['garden', 'classic'] as const).map((view) => (
            <label key={view} style={{ display: 'block' }}>
              <input type="radio" name="defaultView" value={view} checked={v.defaultView === view} onChange={() => setV({ ...v, defaultView: view })} data-testid={`display-view-${view}`} /> {t(`view_${view}`)}
            </label>
          ))}
        </fieldset>
        <label>
          <input type="checkbox" checked={v.reducedMotion} onChange={(e) => setV({ ...v, reducedMotion: e.target.checked })} data-testid="display-reduced-motion" /> {t('reducedMotion')}
        </label>
        <small>{t('reducedMotionHelp')}</small>
        <small>{t('themeNote')}</small>
        {saved ? <Alert tone="success"><span data-testid="display-saved">{t('saved')}</span></Alert> : null}
        <Button type="submit" disabled={action.pending} data-testid="display-save">{t('save')}</Button>
      </Stack>
    </form>
  );
}
