'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Stack } from '@/components/ui/Layout';
import type { AvatarCatalog, AvatarView } from '../service';
import { AvatarEditor } from './AvatarEditor';

/** Onboarding (PAGES.md §2) : l'avatar est l'étape 1, facultative, avant l'assistant du premier jardin. */
export function WelcomeAvatarStep({ catalog, avatar, children }: { catalog: AvatarCatalog; avatar: AvatarView; children: ReactNode }) {
  const t = useTranslations('avatar');
  const [done, setDone] = useState(false);
  if (done) return <>{children}</>;
  return (
    <Stack gap="md">
      <h1>{t('welcomeTitle')}</h1>
      <p>{t('welcomeIntro')}</p>
      <AvatarEditor catalog={catalog} avatar={avatar} footer={<Button variant="honey" onClick={() => setDone(true)} data-testid="welcome-avatar-continue">{t('welcomeContinue')}</Button>} />
    </Stack>
  );
}
