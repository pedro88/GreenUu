/** Associations symétriques stockées une fois (a < b) : voisins d'une espèce, dans les deux sens (RG-PLT-05). */
export function companionsOf<T extends { speciesAId: string; speciesBId: string; effect: 'favorable' | 'unfavorable' }>(rows: T[], speciesId: string) {
  return rows.flatMap((r) =>
    r.speciesAId === speciesId ? [{ speciesId: r.speciesBId, effect: r.effect }] : r.speciesBId === speciesId ? [{ speciesId: r.speciesAId, effect: r.effect }] : [],
  );
}
