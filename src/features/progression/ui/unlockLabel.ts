'use client';

import { useTranslations } from 'next-intl';
import type { UnlockConditionV1 } from '../unlock.pure';

/** Condition de déblocage en clair (« Débloqué au niveau 5 », « Succès Semencier », §10.4). */
export function useUnlockLabel() {
  const t = useTranslations('unlock');
  const ta = useTranslations('achievements');
  const ts = useTranslations('skills');
  const tse = useTranslations('seasonNames');
  return (c: UnlockConditionV1): string => {
    switch (c.kind) {
      case 'none': return t('none');
      case 'level': return t('level', { min: c.min });
      case 'skill': return t('skill', { skill: ts(c.skill), min: c.min });
      case 'achievement': return t('achievement', { name: ta(c.code) });
      case 'season_active': return t('season', { season: tse(c.season) });
    }
  };
}
