'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAction } from '@/components/ui/useAction';
import { tDynamic } from '@/i18n/dynamic';
import type { NotificationChannel, NotificationType } from '@/lib/enums';
import { setPreferenceAction } from '../actions';

/** Préférences par type × canal (RG-NTF-02). Succès et quêtes : jamais par e-mail. */
export function PreferencesForm({ types, initial }: { types: NotificationType[]; initial: Record<string, boolean> }) {
  const t = useTranslations('notifications');
  const tt = useTranslations('notificationTypes');
  const [v, setV] = useState(initial);
  const action = useAction(setPreferenceAction, { refresh: false });
  const toggle = (type: NotificationType, channel: NotificationChannel, enabled: boolean) => {
    setV((s) => ({ ...s, [`${type}:${channel}`]: enabled }));
    void action.run({ type, channel, enabled });
  };
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr><th scope="col" style={{ textAlign: 'left' }}>{t('type')}</th><th scope="col">{t('inApp')}</th><th scope="col">{t('email')}</th></tr></thead>
      <tbody>
        {types.map((type) => (
          <tr key={type}>
            <th scope="row" style={{ textAlign: 'left', fontWeight: 600, padding: '8px 0' }}>{tDynamic(tt, type, type)}</th>
            {(['in_app', 'email'] as const).map((ch) => {
              const never = ch === 'email' && (type === 'achievement' || type === 'quest');
              return (
                <td key={ch} style={{ textAlign: 'center' }}>
                  <input type="checkbox" style={{ width: 24, height: 24 }} aria-label={`${tDynamic(tt, type, type)} — ${ch === 'email' ? t('email') : t('inApp')}`}
                    checked={!never && (v[`${type}:${ch}`] ?? false)} disabled={never} onChange={(e) => toggle(type, ch, e.target.checked)} data-testid={`pref-${type}-${ch}`} />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
