type LooseTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

/**
 * Traduit une clé connue seulement à l'exécution (code venant de la base, clé d'erreur métier).
 * Si la clé n'existe pas dans le namespace, renvoie `fallback`.
 */
export function tDynamic(t: object, key: string, fallback: string, values?: Record<string, string | number>): string {
  // as: point d'entrée unique des clés dynamiques ; t.has vérifie l'existence avant traduction.
  const loose = t as LooseTranslator;
  return loose.has(key) ? loose(key, values) : fallback;
}
