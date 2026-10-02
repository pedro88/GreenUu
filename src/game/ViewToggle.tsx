'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useAction } from '@/components/ui/useAction';
import { setDisplayPrefsAction } from '@/features/display/actions';

/**
 * Bascule vue jardin ↔ vue classique (§9, MAP-12) : la vue choisie est enregistrée comme vue par défaut, puis ouverte.
 * Ce composant n'importe pas le moteur : la vue classique ne charge jamais PixiJS (MAP-01).
 */
export function ViewToggle({ gardenId, to }: { gardenId: string; to: 'garden' | 'classic' }) {
  const t = useTranslations('scene');
  const router = useRouter();
  const action = useAction(setDisplayPrefsAction, { refresh: false });
  const go = async () => {
    await action.run({ defaultView: to });
    router.push(`/app/jardins/${gardenId}?vue=${to === 'garden' ? 'jardin' : 'classique'}`);
  };
  return (
    <Button variant="secondary" disabled={action.pending} onClick={() => void go()} data-testid={to === 'garden' ? 'view-garden' : 'view-classic'}>
      {t(to === 'garden' ? 'gardenView' : 'classicView')}
    </Button>
  );
}
