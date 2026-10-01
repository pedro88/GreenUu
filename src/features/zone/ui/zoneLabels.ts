import { tDynamic } from '@/i18n/dynamic';
import { useTranslations } from 'next-intl';

/** Libellé d'un type de zone : clé i18n pour les types de base, libellé libre pour les personnalisés. */
export function useZoneTypeLabel() {
  const t = useTranslations('zoneTypes');
  return (type: { code: string; label: string; isCustom: boolean }) => (type.isCustom ? type.label : tDynamic(t, type.code, type.label));
}
