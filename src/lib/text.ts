/** Normalisation de recherche : minuscules, ligatures dépliées (œ → oe), sans accents ni ponctuation. */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
