'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { useAction } from '@/components/ui/useAction';
import { exportStatsAction } from '../actions';

/** STAT-07 : téléchargement du CSV des statistiques (owner et admins). */
export function ExportStats({ gardenId }: { gardenId: string }) {
  const t = useTranslations('stats');
  const action = useAction(exportStatsAction, {
    refresh: false,
    onSuccess: ({ filename, csv }) => {
      // BOM UTF-8 : les tableurs reconnaissent les accents.
      const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  return (
    <div>
      <Button variant="secondary" onClick={() => void action.run({ gardenId })} disabled={action.pending} data-testid="stats-export"><Download aria-hidden size={18} />{t('export')}</Button>
      <FormError error={action.error} />
    </div>
  );
}
