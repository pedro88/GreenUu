'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ZoneForm, type ZoneTypeOption } from './ZoneForm';

export function NewZoneButton({ gardenId, parent, types, variant = 'primary' }: {
  gardenId: string; parent?: { id: string; name: string } | null; types: ZoneTypeOption[]; variant?: 'primary' | 'secondary';
}) {
  const t = useTranslations('zones');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={parent ? t('newChildTitle', { parent: parent.name }) : t('newTitle')}
      trigger={<Button variant={variant} data-testid={parent ? `add-child-${parent.id}` : 'add-zone'}><Plus aria-hidden size={18} />{parent ? t('addChild') : t('add')}</Button>}
    >
      <ZoneForm gardenId={gardenId} parentId={parent?.id ?? null} types={types} onDone={(id) => { setOpen(false); router.push(`/app/jardins/${gardenId}/zones/${id}`); }} />
    </Dialog>
  );
}
