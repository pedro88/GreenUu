import { tDynamic } from '@/i18n/dynamic';

/** Titre affiché : clé traduisible pour les tickets générés (étapes), sinon le titre saisi. */
export function ticketTitle(t: object, row: { title: string; titleKey: string | null; titleParams: Record<string, string> | null }): string {
  return row.titleKey ? tDynamic(t, row.titleKey, row.title, row.titleParams ?? {}) : row.title;
}
